import React from 'react';
import TemperatureInput from './TemperatureInput';
import Verdict from './Verdict';

export default class TemperatureCalculator extends React.Component {
    state = { temperature: '', scale: 'c' };

    handleChange = (e, scale) => {
        this.setState({
            temperature: e.target.value,
            scale: scale
        })
    }
    render() {
        const { temperature, scale } = this.state;
        let celsius = 0;
        let fahrenheit = 0;

        if (scale === 'c') {
            celsius = temperature;
            if (temperature === '' || isNaN(parseFloat(temperature))) {
                fahrenheit = '';
            } else {
                fahrenheit = (parseFloat(temperature) * 9 / 5) + 32;
                fahrenheit = parseFloat(fahrenheit).toFixed(2);
            }
        } else {
            fahrenheit = temperature;
            if (temperature === '' || isNaN(parseFloat(temperature))) {
                celsius = '';
            } else {
                celsius = (parseFloat(temperature) - 32) * 5 / 9;
                celsius = parseFloat(celsius).toFixed(2);
            }
        }

        return (
            <div>
                <TemperatureInput scale='c' temperature={celsius} onTemperatureChange={this.handleChange} />
                <TemperatureInput scale='f' temperature={fahrenheit} onTemperatureChange={this.handleChange} />
                <Verdict celsius={celsius}></Verdict>
            </div>
        )
    }
}