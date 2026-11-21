import { expect } from 'chai';

import { isTemperatureSensorId } from '../shared/sensor-filter';

describe('isTemperatureSensorId', () => {
    it('keeps lm-sensors temperatures', () => {
        expect(isTemperatureSensorId('f71868a-isa-0e80:MB Temp:temp1_input')).to.equal(true);
        expect(isTemperatureSensorId('k10temp-pci-00c3:CPU Temp:temp1_input')).to.equal(true);
    });

    it('drops voltages, fans and power readings', () => {
        expect(isTemperatureSensorId('f71868a-isa-0e80:3VSB:in7_input')).to.equal(false);
        expect(isTemperatureSensorId('f71868a-isa-0e80:Array Fan:fan2_input')).to.equal(false);
        expect(isTemperatureSensorId('fam15h_power-pci-00c4:power1:power1_input')).to.equal(false);
    });

    it('keeps sensors from other sources', () => {
        expect(isTemperatureSensorId('ipmi:system_temp')).to.equal(true);
        expect(isTemperatureSensorId('disk:sdb')).to.equal(true);
        expect(isTemperatureSensorId('custom-name')).to.equal(true);
    });
});
