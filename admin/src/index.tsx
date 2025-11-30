import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { Theme, Utils, type ThemeName } from '@iobroker/adapter-react-v5';
import App from './App';

let themeName = Utils.getThemeName();
let root: Root | null = null;

function build(): void {
    const container = document.getElementById('root');
    if (!container) {
        console.error('Root element not found');
        return;
    }

    // Only create root once
    if (!root) {
        root = createRoot(container);
    }

    root.render(
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={Theme(themeName)}>
                <App
                    adapterName="unraid"
                    onThemeChange={(newThemeName: ThemeName) => {
                        themeName = newThemeName;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>,
    );
}

build();
