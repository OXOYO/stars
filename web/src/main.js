import { createApp } from 'vue';
import App from './App.vue';
import { initColorTheme } from './theme/color-theme';
import './styles/app.css';

initColorTheme();
createApp(App).mount('#app');
