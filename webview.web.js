'use strict';

import React from 'react';
import { View } from 'react-native'

export default class WebView extends React.Component {
  onload() {
    debugger
  }

  render() {
    return (
      <iframe style={{ width: 100, height: 100 }} onload={this.onload.bind(this)}>
        <script type="text/javascript" src="https://platform.linkedin.com/in.js">
          api_key: test
        </script>
      </iframe>
    )
  }
}
