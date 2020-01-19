// transforms long lat to lat long for leaflet
function reverseCoordinates(coordinates) {
    let result = [];
    for (let i = 0; i < coordinates.length; i++) {
        if (Array.isArray(coordinates[i])) {
            result[i] = reverseCoordinates(coordinates[i]);
        } else {
            result[i] = coordinates[i + 1];
            result[i + 1] = coordinates[i];
            return result;
        }
    }
    return result;
}

function isDuplicate(sensors, entry) {
    for (let i = 0; i < sensors.length; i++) {
        if ((sensors[i].lon === entry.lon) && (sensors[i].lat === entry.lat)) {
            return true;
        }
    }
    return false;
}

function getColor(density) {
    return density > 350 ? '#a10443' :
        density > 275 ? '#b31847' :
            density > 225 ? '#be2549' :
                density > 175 ? '#d5404b' :
                    density > 125 ? '#de4d4a' :
                        density > 75 ? '#eb6449' :
                            density > 60 ? '#f3784c' :
                                density > 50 ? '#fba25d' :
                                    density > 40 ? '#fcaf65' :
                                        density > 35 ? '#f6faaf' :
                                            density > 30  ? '#f6faaf' :
                                                density > 25 ? '#e8f6a4' :
                                                    density > 20 ? '#b1dfa1' :
                                                        density > 10 ? '#b1dfa1' :
                                                            density > 0 ? '#73c3a7' :
                                                                '#888888';
}



function getCoordConverter() {
    let otherProjection = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs"; // projection to EPGS 25832

    // proj4 with only 1 projection uses WGS84 as second default
    // proj4 without coordinates returns object, that projects from first to second projection via forward or the other way with inverse
    return proj4(otherProjection);
}

function isOutsidePolygon(entry, polygon) {
    let temp = martinez.intersection([[
        [entry.lat, entry.lon],
        [entry.lat + 0.0001, entry.lon],
        [entry.lat, entry.lon + 0.0001]
    ]], [reverseCoordinates(polygon)]);
    return temp.length < 1;
}

function intersection(cell,polygon){
    // martinez seems to have a bug, this is a workaround
    let intersection = cell;
    try {
        intersection = martinez.intersection([cell], [polygon]);
    } catch (e) {
        console.log(e);
    }
    return reverseCoordinates(intersection);
    // this is another intersection from a different library. Working but much slower
    // wantedSensors[i].cell = PolyBool.intersect(
    //     {
    //         regions: [reversedCell],
    //         inverted: false
    //     }, {
    //         regions: [reverseCoordinates(reverseStuttgartPolygon)],
    //         inverted: false
    //     }
    // ).regions;
}