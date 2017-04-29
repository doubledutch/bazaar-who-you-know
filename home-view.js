import React, { Component } from 'react';
import ReactNative from 'react-native';
import Update from 'react-addons-update'
import DD from './dd-bindings'
import WebView from './webview'
import SGListView from 'react-native-sglistview'
import Prompt from 'react-native-prompt'
const _ = require('lodash')
const PQueue = require('p-queue')

const { Alert, TouchableOpacity, Text, View, ScrollView, Image, AsyncStorage, Button, ListView } = ReactNative
import Bazaar from 'bazaar-client'
const packageInfo = require('./package.json')
const bazaarInfo = require('./bazaar.json')
const xml2json = require('xml2js').parseString

var ScreenView = ReactNative.Platform.select({
  ios: () => Bazaar.View,
  android: () => ReactNative.View,
  web: () => ReactNative.View
})()
const isSandboxed = false

const linkedInKey = ''
const linkedInSecret = ''
const linkedInScopes = ['r_basicprofile', 'r_network'].join('%20')
const linkedInRedirectURI = 'https://doubledutch.me'

class HomeView extends Component {
  constructor({ ddOverride }) {
    super()

    const eventID = isSandboxed ? DD.currentEvent.EventId : ReactNative.Platform.select({
      ios: () => DD.currentEvent.EventId,
      android: () => JSON.parse(DD.currentEvent).EventId,
      web: () => DD.currentEvent.EventId
    })();

    const ScreenView = isSandboxed ? ReactNative.View : ReactNative.Platform.select({
      ios: () => Bazaar.View,
      android: () => ReactNative.View,
      web: () => ReactNative.View
    })();

    const options = {
      isSandboxed: isSandboxed,
      featureName: packageInfo.name,
      eventID: eventID,
      horizonHost: isSandboxed ? 'localhost:7171' : 'bazaar.doubledutch.me'
    }
    this.api = new Bazaar.Client(DD, options)
    this.state = { loading: true }
    this.autoFollow = this.autoFollow.bind(this)
    this.bulkMessage = this.bulkMessage.bind(this)
    this._onNavigationStateChange = this._onNavigationStateChange.bind(this)

    this.queue = new PQueue({ concurrency: 1 })
    this.eventID = eventID
  }

  componentDidMount() {
    var self = this
    this.api.connect().then((user) => {

      // TODO: query from a collection on load

    }).catch((err) => {
      debugger
      Alert.alert('Error: ' + err)
    })

    AsyncStorage.multiGet(['token', 'connections', 'matches', 'users']).then(([token, connections, matches, users]) => {
      this.setState({ loading: false, matches: JSON.parse(matches[1]), users: JSON.parse(users[1]), connections: JSON.parse(connections[1]), token: token[1] })
    }).catch((err) => {
      this.setState({ loading: false })
    })

    fetch('https://api.doubledutch.me/v2/admin/userlist?sessiontoken=32b43cc4-3c89-494d-a4a1-344836200f88')
      .then((res) => res.json())
      .then((json) => {
        this.setState({ loading: false, users: json.Value })
      })

    DD.setTitle(`Your LinkedIn Connections`)
  }

  _onNavigationStateChange(webViewState) {
    if (webViewState.loading && webViewState.url.indexOf(linkedInRedirectURI) === 0) {
      this.setState({ loading: true })

      const code = webViewState.url.substring(webViewState.url.indexOf('=') + 1).split('&')[0]

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(linkedInRedirectURI)}&client_id=${linkedInKey}&client_secret=${linkedInSecret}`
      }
      fetch('https://www.linkedin.com/oauth/v2/accessToken', options)
        .then((res) => res.json())
        .then((json) => {

          this.access_token = json.access_token

          const connOptions = {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer ' + this.access_token
            }
          }

          // TODO - need to page this
          fetch('https://api.linkedin.com/v1/people/~/connections?format=json', connOptions)
            .then((res) => res.json())
            .then((json) => {
              const connections = json.values
              AsyncStorage.setItem('connections', JSON.stringify(connections))

              const matches = []

              _.intersectionWith(this.state.users, connections, (user, conn) => {
                if (user.FirstName === conn.firstName) {
                  if (user.LastName === conn.lastName) {
                    matches.push({ user, connection: conn })
                    return true
                  }
                }
                return false
              })

              AsyncStorage.setItem('matches', JSON.stringify(matches))
              this.setState({ loading: false, matches: matches, connections: connections, token: this.access_token })
            })
            .catch((err) => {
              debugger
            })
        })
    }
  }

  getDataSource() {
    const dataSource = new ListView.DataSource(
      { rowHasChanged: (r1, r2) => r1.uuid !== r2.uuid });

    const matches = this.state.matches.sort((m1, m2) => m1.connection.lastName < m2.connection.lastName ? -1 : 1)
    const hasMatches = this.state.matches.length > 0;
    return hasMatches ? dataSource.cloneWithRows(matches) : dataSource;
  }

  renderRow(match, sectionID, rowID) {
    const c = match.connection
    return (
      <TouchableOpacity onPress={() => DD.openURL('dd://profile/' + match.user.Id)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Image source={{ uri: c.pictureUrl }} style={{ height: 50, width: 50, marginRight: 10, borderRadius: 25 }} />
        <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <Text style={styles.title}>{c.firstName} {c.lastName}</Text>
          <Text style={styles.subtitle}>{c.headline}</Text>
        </View>
        <TouchableOpacity onPress={() => DD.openURL('dd://messages/' + match.user.Id)} style={{ flexDirection: 'row', marginRight: 10 }}>
          <Image source={{ uri: 'https://cms.doubledutch.me/Content/images/settings/sets/v4/Black/11.png' }}
            style={{ height: 40, width: 40 }}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => DD.openURL(c.siteStandardProfileRequest.url)} style={{ flexDirection: 'row' }}>
          <Image source={{ uri: 'http://seeklogo.com/images/L/linkedin-icon-logo-05B2880899-seeklogo.com.gif' }}
            style={{ height: 40, width: 40 }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  autoFollow() {
    Alert.alert(
      'Auto-Follow',
      `Do you want to follow these ${this.state.matches.length} connections?`,
      [
        { text: 'Cancel', onPress: () => { }, style: 'cancel' },
        {
          text: 'Yes', onPress: () => {
            DD.requestAccessToken((err, token) => {
              const options = {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
              }

              this.state.matches.forEach((m) => {
                this.queue.add(() =>
                  fetch(`https://api.doubledutch.me/v2/users/${m.user.Id}/following?isBundleCredentials=true&applicationid=${this.eventID}`,
                    Object.assign({}, options, { body: JSON.stringify({ "Id": m.user.Id }) })
                  )
                    .then((response) => response.json())
                    .catch((error) => {
                      reject(error)
                    })
                    .then((result) => {
                      resolve(result.Value)
                    })
                )
              })
            })
          }
        },
      ],
      { cancelable: false }
    )
  }

  bulkMessage() {
    this.setState({ promptVisible: true })
  }

  render() {

    if (this.state.loading) {
      return (
        <ScreenView title="" style={{ flex: 1 }}>
          <Text>Loading...</Text>
        </ScreenView>
      )
    } else if (this.state.matches) {
      return (
        <ScreenView title="" style={{ flex: 1 }}>
          <ScrollView style={styles.container}>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <Button onPress={this.autoFollow} title='Auto-follow' style={{ flex: 1 }} />
              <Button onPress={this.bulkMessage} title='Bulk Message' style={{ flex: 1 }} />
            </View>
            <View>
              <SGListView
                ref='connections_ref'
                dataSource={this.getDataSource()}
                renderRow={this.renderRow}
              />
            </View>
          </ScrollView>

          <Prompt
            title="Write your message"
            placeholder="..."
            defaultValue=""
            visible={this.state.promptVisible}
            onCancel={() => this.setState({
              promptVisible: false,
              message: "You cancelled"
            })}
            onSubmit={(value) => this.setState({
              promptVisible: false,
              message: `You said "${value}"`
            })} />
        </ScreenView>
      )
    }

    const linkedInState = 'foo'

    return (
      <ScreenView title="" style={{ flex: 1 }}>
        {this.state.showAuthorize ?
          <WebView
            source={{ uri: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${linkedInKey}&scope=${linkedInScopes}&state=${linkedInState}&redirect_uri=${encodeURIComponent(linkedInRedirectURI)}` }}
            onNavigationStateChange={this._onNavigationStateChange}

          /> : <ScrollView style={styles.container}>
            <Button style={{ marginTop: 20 }} title='Connect to LinkedIn' onPress={() => this.setState({ showAuthorize: true })} />
          </ScrollView>
        }
      </ScreenView>
    )
  }
}

const styles = ReactNative.StyleSheet.create({
  headerImage: {
    marginHorizontal: 20,
    marginVertical: 10,
    flex: 1,
    height: 30,
  },
  title: {
    fontWeight: '600',
    fontSize: 16
  },
  subtitle: {
    fontWeight: '300',
    fontSize: 12
  },
  container: {
    flex: 1,
    backgroundColor: '#dedede',
    padding: 10,
  },
  welcome: {
    fontSize: 24,
    textAlign: 'center',
    fontWeight: 'bold',
    margin: 10,
  },
  h1: {
    fontSize: 18,
    textAlign: 'left',
    fontWeight: 'bold',
    marginVertical: 4,
  },
  h2: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'left',
    marginVertical: 2,
  },
  h3: {
    fontSize: 14,
    textAlign: 'left',
    marginVertical: 2,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
});

export default HomeView
