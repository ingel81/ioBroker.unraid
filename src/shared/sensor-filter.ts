/** lm-sensors value key such as `temp1_input`, `in7_input`, `fan2_input` or `power1_input` */
const LM_SENSORS_KEY = /^[a-z]+\d*_input$/i;
/** lm-sensors key of a temperature reading */
const LM_SENSORS_TEMPERATURE_KEY = /^temp\d+_input$/i;

/**
 * Decide whether a sensor reported by Unraid's temperature API really is a temperature.
 *
 * Unraid's lm-sensors reader takes every `*_input` value of `sensors -j` and reports it as
 * a temperature in °C, including voltages (`in*_input`), fan speeds (`fan*_input`) and
 * power (`power*_input`). The sensor id ends with that key (`<chip>:<label>:<key>`), so
 * lm-sensors readings are kept only for `temp*_input`. Ids from other sources (IPMI,
 * disks) do not end with such a key and are kept unchanged.
 *
 * @param id - Sensor id as delivered by the API
 * @returns true if the sensor should be shown as a temperature
 */
export function isTemperatureSensorId(id: string): boolean {
    const key = id.split(':').pop() ?? id;
    if (!LM_SENSORS_KEY.test(key)) {
        return true;
    }
    return LM_SENSORS_TEMPERATURE_KEY.test(key);
}
