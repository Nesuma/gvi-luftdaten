const express = require('express');
const fs = require('fs');
const csp = require(`helmet-csp`)
const {promisify} = require('util');
//const request = require('request');
const path = require('path')
const request_promise = require('request-promise-native');
// const fs = require('fs').promises; // makes file reading work with async / await
const $ = require('jquery');
const app = express();
const port = 3000;
const readFileAsync = promisify(fs.readFile);

let separator = ';';

let dateIndex = 1;

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
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
            console.log("downloaded " + filename);
        } catch (err) {
            if ((err === undefined) || (err.result === undefined)) {
                // UnhandledPromiseRejectionWarning: TypeError: Cannot read property 'statusCode' of undefined
                // console.log("undefined error: " + filename);
            } else if (err.response.statusCode === 404) {
                console.log(date + "/" + filename + " doesn't exist online");
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

function floorToTen(minutes) {
    return (Math.floor(minutes / 10)) * 10;
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

            // floorToTen necessary so that only values for minute 0,10,20,... are stored
            this.addDataPoint({
                    year: splitDate.year, month: splitDate.month, day: splitDate.day,
                    hour: splitDate.hour, minutes: floorToTen(splitDate.minutes)
                }, {p1: p10, p2: p2_5, lon: this.lon, lat: this.lat}
            );

        }
    }
}

function extractSensorId(id) {
    // produkt_ff_stunde_20180707_20200107_04928.txt
    return parseInt(id.substring(id.lastIndexOf("_") + 1, id.indexOf('.')));
}

function readFilesRecursively(dirName, files) {
    let fileNames = [];
    try {
        fileNames = fs.readdirSync(dirName);
    } catch (e) {
        console.log("No directory " + dirName);
    }
    files = files || {};

    for (let filename of fileNames) {
        if (fs.statSync(dirName + "/" + filename).isDirectory()) {
            files = getAllFiles(dirName + "/" + filename, files)
        } else {
            files[filename] = readFileAsync(dirName + filename, 'utf-8').catch(error => {
                console.log('caught', error.message);
            });
            ; // async read call returns promise
        }
    }
    return files;
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
    const measurementPromises = readFilesRecursively("../data/wind/measurements/");
    const stationPromises = readFilesRecursively('../data/wind/stations/');

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
    return sensors;
}

async function getDustSensors(dir) {
    let sensors = {};

    // async: reading the files stored in directories from disk
    let filePromises = readFilesRecursively(dir);
    let sensorDataPromises = {};
    for (const [filename, dataPromise] of Object.entries(filePromises)) {
        sensorDataPromises[filename] = getLinesFromFile(dataPromise);
    }

    // creating sensor objects with the arrays of data lines
    for (const [filename, sensorPromise] of Object.entries(sensorDataPromises)) {
        let numId = extractSensorId(filename);
        if (sensors[numId] === undefined) {
            sensors[numId] = new DustSensor();
        }
        sensors[numId].storeMeasurements(await sensorPromise);
    }
    console.log("finished " + dir);
    return sensors;
}

async function startWindAPI(sensorsPromise) {
    let type = "wind";
    let sensors = await sensorsPromise;
    // console.log(sensors);
    console.log("starting " + type + " api");
    let doc = "There are multiple stations: ";

    app.get('/' + type, (req, res) => {
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

async function startStaticFileAPI() {
    app.get("/landkreis", async (req, res) => {
        res.sendFile(path.join(__dirname, "../data/shapes/utm32.json"));
    });
    app.use(csp({
        directives: {
            defaultSrc: [`'self'`]
        }
    }));
    app.use(express.static("public"));
}

// async function startDustAPI(dustIDs, sensors) {
async function startDustAPI(dustIDs) {
    let type = "dust";
    // console.log(sensors);
    console.log("starting " + type + " api");
    let doc = "There are multiple stations: ";

    app.get('/' + type, (req, res) => {
        let stations = "";
        for (const [key, value] of Object.entries(dustIDs)) {
            stations += "\n" + key;
        }
        res.send(doc + stations);
    });
    app.get('/' + type + '/:stationId', (req, res) => {
        res.send("Ask like this: http://localhost:3000/" + type + "/140/2020-1-8-16-20");
    });
    app.get('/' + type + '/:stationId/:year-:month-:day-:hour-:minutes', async (req, res) => {
        let station = req.params['stationId'];
        let year = req.params['year'];
        let month = req.params['month'];
        let day = req.params['day'];
        let hour = req.params['hour'];
        let minutes = req.params['minutes'];

        let queriedSensors = await getDustSensors("../data/dust/" + year + "-" + prefixZeros(month) + "-" + prefixZeros(day) + "/");
        let sensor;
        // if sensor doesn't exist disk is checked for data, if it still doesn't exist return error
        try {
            sensor = queriedSensors[station].measures[year][month][day][hour][minutes];
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

    app.get("/" + type + "/all/:year-:month-:day", async (req, res) => {
        let year = req.params['year'];
        let month = req.params['month'];
        let day = req.params['day'];

        let queriedSensors = await getDustSensors("../data/dust/" + year + "-" + prefixZeros(month) + "-" + prefixZeros(day) + "/");

        let result = {};
        for (const [id, sensor] of Object.entries(queriedSensors)) {
            console.log("id: " + id);
            console.log(sensor);
            result[id] = sensor.measures[year][month][day];
        }
        res.send(result);
    })
}

function prefixZeros(number) {
    return (number < 10) ? "0" + number : number;
}

async function downloadDustFiles(sensorsPromise, dustIDs, outputPath) {
    let sensors;
    console.log("[" + Object.keys(dustIDs).length + "]: " + Object.keys(dustIDs));
    sensors = await sensorsPromise; //  necessary so that all wind dates are read

    // let sensor = sensors[Object.keys(sensors)[0]]; // every sensor has data for the same dates, just take the first
    let activeDownloads = [];

    for (let key in sensors) {
        let sensor = sensors[key];
        let keys = Object.keys(sensor.measures);
        console.log(keys);
        for (let i = keys.length - 1; i >= 0; i--) {
            console.log("i = " + i);
            let year = keys[i];
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
                    for (let id of Object.keys(dustIDs)) {
                        // console.log(date + " " + id);
                        activeDownloads.push(downloadCSV(date, id, outputPath));
                    }
                }
                if (activeDownloads.length > (365 * Object.keys(dustIDs).length)) {
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
    // alle windsensoren holen damit die ids gelistet werden können
    app.get('/', function (req, res) {
        res.sendFile(path.join(__dirname, '/../index.html'));

    });

    const windSensorsPromise = getWindSensors();
    let dustIDs = await getDustSensorIds("48.774,9.174,10");

    // const dustSensorPromise = getDustSensors();
    const dustDownloadPromise = downloadDustFiles(windSensorsPromise, dustIDs, "../data/dust/");

    // let dustSensors = {};
    startStaticFileAPI();

    startWindAPI(windSensorsPromise);
    // startDustAPI(dustIDs, dustSensors);
    startDustAPI(dustIDs);


    app.get('/', (req, res) => res.send("Wind and Dust Archive API"));

    // await dustDownloadPromise;
    // startAPI(sensorsPromise,"dust"); // update when all files are downloaded
}

startAPIS();

app.listen(port, () => console.log(`Example on port ${port}`));
