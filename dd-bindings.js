import {
  NativeModules, Platform, Alert
} from 'react-native'

const base64 = require('base-64')

const DD = Platform.select({
  ios: () => NativeModules.DDBindings,
  android: () => Object.assign({}, NativeModules.DDBindings, { currentEvent: JSON.parse(NativeModules.DDBindings.currentEvent) }),
  web: () => null
})() || {
    openURL: (url) => alert(url),
    currentEvent: { EventId: 'sample-event-id' },
    setTitle: () => { },
    requestAccessToken: (callback) => {
      return callback(null, 'fake-access-token')
      const token = '<fill in>'
      const secret = '<fill in>'

      const options = {
        method: 'POST',
        headers: {
          'Authorization': "Basic " + base64.encode(`${token}:${secret}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: "grant_type=password&username=<fill in>&password=<fill in>"
      }

      const url = `https://us-identity.doubledutch.me/access/tokens`
      fetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          callback(error)
        })
        .then((result) => {
          callback(null, result.access_token)
        })
    },
    primaryColor: '#00ff00',
    setNavigationBarHidden: () => { }
  }

export default DD