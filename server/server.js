const express = require('express');
const fs = require('fs');
const {promisify} = require('util');
const request = require('request');
const request_promise = require('request-promise-native');
// const fs = require('fs').promises; // makes file reading work with async / await
const $ = require('jquery');
const app = express();
const port = 3000;
const readFileAsync = promisify(fs.readFile);

let separator = ';';

//https://learnscraping.com/how-to-download-files-with-nodejs-using-request/
// Sensor 13463

async function getDustSensorIds(area) {
    let options = {uri: "https://data.sensor.community/airrohr/v1/filter/area=" + area, json: true};
    let ids = {}; // is an object instead of array to prevent duplicates
    let rp = await request_promise(options);

    for (let measurement of rp) {
        for (let sensordata of measurement.sensordatavalues) {
            if ((sensordata.value_type === "P1") || (measurement.sensordatavalues.value_type === "P2")) {
                ids[measurement.sensor.id] = "placeholder";
            }
        }
    }
    return ids;
}

async function downloadCSV(date, sensorId, outputPath) {
    let filename = date.toString() + "_sds011_sensor_" + sensorId + ".csv";
    let outputDirectory = outputPath + "/" + date + "/";
    let outputFilePath = outputDirectory + filename;
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory);
    }
    if (!fs.existsSync(outputFilePath)) {
        let options = {uri: 'http://archive.luftdaten.info/' + date + '/' + filename, json: true};
        // GET is what takes so long
        try {
            fs.writeFileSync(outputFilePath, await request_promise(options));
            // console.log("downloaded " + filename);
        } catch (err) {
            if ((err === undefined) || (err.result === undefined)) {
                // UnhandledPromiseRejectionWarning: TypeError: Cannot read property 'statusCode' of undefined
                // console.log("undefined error: " + filename);
            } else if (err.response.statusCode === 404) {
                // console.log(date + "/" + filename + " doesn't exist online");
            } else {
                console.log(err);
            }
        }
    } else {
        // console.log(outputFilePath + " exists already");
    }
}

class Sensor {
    constructor() {
        this.measures = {};
    }

    setCoordinates(lon, lat) {
        this.lon = lon;
        this.lat = lat;
    }

    splitDate(date) {
        let yearDetail = 4;
        let monthDetail = 2;
        let dayDetail = 2;
        let hourDetail = 2;
        let minutesDetail = 2;

        let result = {};

        let currentIndex = 0;
        result.year = parseInt(date.substring(currentIndex, yearDetail));
        currentIndex += yearDetail;

        result.month = parseInt(date.substring(currentIndex, currentIndex + monthDetail));
        currentIndex += monthDetail;

        result.day = parseInt(date.substring(currentIndex, currentIndex + dayDetail));
        currentIndex += dayDetail;

        result.hour = parseInt(date.substring(currentIndex, currentIndex + hourDetail));
        currentIndex += hourDetail;

        result.minutes = parseInt(date.substring(currentIndex, currentIndex + minutesDetail));
        return result;
    }

    addDataPoint(date, dataPoint) {
        let year = date.year;
        let month = date.month;
        let day = date.day;
        let hour = date.hour;
        let minutes = date.minutes;

        if (this.measures[year] === undefined) {
            this.measures[year] = {};
        }
        if (this.measures[year][month] === undefined) {
            this.measures[year][month] = {};
        }
        if (this.measures[year][month][day] === undefined) {
            this.measures[year][month][day] = {};
        }
        if (this.measures[year][month][day][hour] === undefined) {
            this.measures[year][month][day][hour] = {};
        }

        if (this.measures[year][month][day][hour][minutes] === undefined) {
            this.measures[year][month][day][hour][minutes] = {};
        }
        // console.log("setting: "+year+" "+month+" "+day+" "+hour+" "+minutes);
        // console.log("last value is: ");
        // console.log(dataPoint);
        this.measures[year][month][day][hour][minutes] = dataPoint;
    }

    storeMeasurements(content) {
        throw new Error("Implement this method!");
    }


}

class WindSensor extends Sensor {
    storeMeasurements(content) {
        let dateIndex = 1;
        let speedIndex = 3;
        let directionIndex = 4;

        for (let line of content) {
            let attributes = line.split(separator);

            let date = attributes[dateIndex];
            let speed = parseFloat(attributes[speedIndex]);
            let direction = parseInt(attributes[directionIndex]);

            let splitDate = this.splitDate(date);

            this.addDataPoint({
                year: splitDate.year, month: splitDate.month,
                day: splitDate.day, hour: splitDate.hour, minutes: splitDate.minutes
            }, {speed: speed, direction: direction, lon: this.lon, lat: this.lat});

        }
    }
}

function roundToTen(minutes){
    return (Math.round(minutes/10))*10;
}

class DustSensor extends Sensor {
    storeMeasurements(content) {
        let latIndex = 3;
        let lonIndex = 4;
        let dateIndex = 5;
        let p10Index = 6;
        let p2_5Index = 9;

        for (let line of content) {
            let attributes = line.split(separator);

            let date = attributes[dateIndex];
            let lon = attributes[lonIndex];
            let lat = attributes[latIndex];
            let p10 = attributes[p10Index];
            let p2_5 = attributes[p2_5Index];

            let splitDate = this.splitDate(date.replace(/[T\-:]/g, "")); // removing T - and :

            this.setCoordinates(lon, lat); // is run every time TODO
            this.addDataPoint({
                    year: splitDate.year, month: splitDate.month, day: splitDate.day,
                    hour: splitDate.hour, minutes: roundToTen(splitDate.minutes)
                }, {p1: p10, p2: p2_5, lon: this.lon, lat: this.lat}
            );

        }
    }
}

function extractSensorId(id) {
    // produkt_ff_stunde_20180707_20200107_04928.txt
    return parseInt(id.substring(id.lastIndexOf("_") + 1, id.indexOf('.')));
}

function readFiles(dirname) {
    let filenames = fs.readdirSync(dirname); // collects file names in directory (sync)
    let dataPromises = {};
    for (let filename of filenames) {
        dataPromises[filename] = readFileAsync(dirname + filename, 'utf-8'); // async read call returns promise
    }
    return dataPromises;
}

async function getLinesFromFile(dataPromise) {
    // console.log("waiting for data promise");
    // console.log(dataPromise);
    const data = await dataPromise;
    let content;
    content = data.substring(data.indexOf("\n") + 1); // remove first line
    content = content.substring(0, content.lastIndexOf("\n")); // remove last line
    return content.split("\n");
    // console.log(sensor);
}

function getCoordinates(metadata) {
    // get array of metadata about geography of one sensor. Only need coordinates, every row has the same (sensors at the same place)
    let values = metadata[0].split(";");
    let lat = values[2].trim();
    let lon = values[3].trim();
    return {lat: lat, lon: lon};
}

async function getWindSensors() {
    let sensors = {};

    // async: reading the files from disk
    const measurementPromises = readFiles('../data/wind/measurements/');
    const stationPromises = readFiles('../data/wind/stations/');

    let sensorDataPromises = {};
    let sensorCoordinatePromises = {};

    // async: splitting the files into arrays of lines
    for (const [filename, dataPromise] of Object.entries(measurementPromises)) {
        sensorDataPromises[filename] = getLinesFromFile(dataPromise);
    }
    for (const [filename, dataPromise] of Object.entries(stationPromises)) {
        let numId = extractSensorId(filename);
        sensorCoordinatePromises[numId] = getLinesFromFile(dataPromise);
    }

    // creating Sensor objects with the arrays of data lines
    for (const [filename, sensorPromise] of Object.entries(sensorDataPromises)) {
        let numId = extractSensorId(filename);
        if (sensors[numId] === undefined) {
            let coordinates = getCoordinates(await sensorCoordinatePromises[numId]);
            sensors[numId] = new WindSensor();
            sensors[numId].setCoordinates(coordinates.lon, coordinates.lat);
        }
        sensors[numId].storeMeasurements(await sensorPromise);
    }
    console.log(sensors);
    return sensors;
}

async function getDustSensors(rootDir) {
    let sensors = {};

    // async: reading the files stored in subdirectories from disk
    let dirNames = fs.readdirSync(rootDir);
    for (let dir of dirNames) {
        let filePromises = readFiles(rootDir + dir + "/");
        let sensorDataPromises = {};
        for (const [filename, dataPromise] of Object.entries(filePromises)) {
            sensorDataPromises[filename] = getLinesFromFile(dataPromise);
        }

        // creating Sensor objects with the arrays of data lines
        for (const [filename, sensorPromise] of Object.entries(sensorDataPromises)) {
            let numId = extractSensorId(filename);
            if (sensors[numId] === undefined) {
                sensors[numId] = new DustSensor();
            }
            sensors[numId].storeMeasurements(await sensorPromise);
        }
        console.log("finished " + dir);
    }
    return sensors;
}

async function startAPI(sensorsPromise, type) {
    let sensors = await sensorsPromise;
    // console.log(sensors);
    console.log("starting " +type+" api");
    let doc = "There are multiple stations: ";

    app.get('/'+type, (req, res) => {
        let stations = "";
        for (const [key, value] of Object.entries(sensors)) {
            stations += "\n" + key;
        }
        res.send(doc + stations);
    });
    app.get('/' + type + '/:stationId', (req, res) => {
        res.send("Ask like this: http://localhost:3000/" + type + "/4928/2020-1-8-16-20");
    });
    app.get('/' + type + '/:stationId/:year-:month-:day-:hour-:minutes', (req, res) => {
        let station = req.params['stationId'];
        let year = req.params['year'];
        let month = req.params['month'];
        let day = req.params['day'];
        let hour = req.params['hour'];
        let minutes = req.params['minutes'];
        let sensor;
        try {
            console.log("test" + month);
            console.log(sensors[station].measures[year][month]);
            sensor = sensors[station].measures[year][month][day][hour][minutes];
            // somehow manual throwing necessary because hour: 30 40 50 ... and minutes 2 3 4 ... 200 300 400 all don't throw an error but are undefined
            // couldn't reproduce it with month
            if (sensor === undefined) {
                throw new Error();
            }
        } catch (err) {
            res.status(404);
            res.send("Station " + station + " or date [" + day + "." + month + "." + year + " " + hour + ":" + minutes + "] unknown");
        }

        res.send(sensor);
    });
}

async function startDustAPI(sensorsPromise, sensorArea, dirName) {
    // await ;
    getDustSensors(dirName);


}

async function downloadDustFiles(sensorsPromise, sensorArea, outputPath) {
    let sensors;
    let ids = await getDustSensorIds(sensorArea);
    console.log("[" + Object.keys(ids).length + "]: " + Object.keys(ids)); // 1127 before filtering, 575 after
    sensors = await sensorsPromise; //  necessary so that all wind dates are read, hopefully one can await twice

    // let sensor = sensors[Object.keys(sensors)[0]]; // every sensor has data for the same dates, just take the first
    let activeDownloads = [];
    for (let key in sensors) {
        let sensor = sensors[key];
        for (let year in sensor.measures) {
            for (let month in sensor.measures[year]) {
                let twoDigitMonth = month; // march is written like 03 but 03 is not defined in months
                if (month < 10) {
                    twoDigitMonth = "0" + month;
                }
                for (let day in sensor.measures[year][month]) {
                    // this works without twoDigitDay because day is not used as object key
                    if (day < 10) {
                        day = "0" + day;
                    }
                    let date = "" + year + "-" + twoDigitMonth + "-" + day;
                    for (let id of Object.keys(ids)) {
                        // console.log(date + " " + id);
                        activeDownloads.push(downloadCSV(date, id, outputPath));
                    }
                }
                if (activeDownloads.length > (365 * Object.keys(ids).length)) {
                    while (activeDownloads.length > 0) {
                        let activeDownload = activeDownloads.shift();
                        await activeDownload;
                    }
                    console.log("awaited all downloads for " + year);
                }
            }
        }
    }
}

async function startAPIS() {
    const windSensorsPromise = getWindSensors();
    const dustSensorPromise = getDustSensors("../data/dust/");
    const dustDownloadPromise = downloadDustFiles(windSensorsPromise,"48.8,9.2,10", "../data/dust/");

    startAPI(windSensorsPromise, "wind");

    startAPI(dustSensorPromise,"dust");

    app.get('/', (req, res) => res.send("Wind and Dust Archive API"));

    await dustDownloadPromise;
    startAPI(sensorsPromise,"dust"); // update when all files are downloaded
}

startAPIS();

app.listen(port, () => console.log(`Example on port ${port}`));
