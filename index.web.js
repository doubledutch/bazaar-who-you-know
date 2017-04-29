var React = require('react-native');
var { AppRegistry } = React;
import HomeView from './home-view.js'

console.error = () => {}
console.disableYellowBox = true;

const runApp = (DD) => {
  AppRegistry.registerComponent('bazaar_sample', () => HomeView);
  AppRegistry.runApplication('bazaar_sample', {
    rootTag: document.getElementById('react-root'),
    initialProps: { ddOverride: DD }
  })
}

if (window.DD && window.DD.Events) {
  Bazaar.WebShim.install((DD) => runApp)
} else {
  runApp(null)
}