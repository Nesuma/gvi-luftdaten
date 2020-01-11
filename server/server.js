const express = require('express');
const fs = require('fs');
const { promisify } = require('util');
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
let speedIndex = 3;
let directionIndex = 4;

// let sensors = {};

//https://learnscraping.com/how-to-download-files-with-nodejs-using-request/
// Sensor 13463

async function getDustSensorIds(area) {
    let options = { uri: "https://data.sensor.community/airrohr/v1/filter/area=" + area, json: true };
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
        let options = { uri: 'http://archive.luftdaten.info/' + date + '/' + filename, json: true };
        // GET is what takes so long
        try {
            fs.writeFileSync(outputFilePath, await request_promise(options));
            // console.log("downloaded " + filename);
        } catch (err) {
            if (err.response === undefined) {
                // UnhandledPromiseRejectionWarning: TypeError: Cannot read property 'statusCode' of undefined
                console.log("undefined error: " + filename);
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

class DustSensor {
    constructor() {
    }
}

class WindSensor {
    constructor(content) {
        this.measures = {};
    }

    addDatapoint(year, month, day, hour, minutes, speed, direction) {
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
        if (this.measures[year][month][day][minutes] === undefined) {
            this.measures[year][month][day][minutes] = {};
        }
        this.measures[year][month][day][hour][minutes] = { speed: speed, direction: direction };
        // console.log(this.measures);
        // console.log("added: " + year + "-" +month+ "-" +day+ "-" +hour+ "-" + minutes + "-" +speed+ "-" +direction)
        // console.log(this.measures[year][month][day][hour][minutes]);
    }

    storeMeasurements(content) {
        let yearDetail = 4;
        let monthDetail = 2;
        let dayDetail = 2;
        let hourDetail = 2;
        let minutesDetail = 2;

        for (let line of content) {
            // console.log("line: " + line);
            let attributes = line.split(separator);

            let date = attributes[dateIndex];
            let speed = parseFloat(attributes[speedIndex]);
            let direction = parseInt(attributes[directionIndex]);

            // console.log("date: " + date + " speed: " + speed + " direction: " + direction);

            let currentIndex = 0;
            let year = parseInt(date.substring(currentIndex, yearDetail));
            currentIndex += yearDetail;

            let month = parseInt(date.substring(currentIndex, currentIndex + monthDetail));
            currentIndex += monthDetail;

            let day = parseInt(date.substring(currentIndex, currentIndex + dayDetail));
            currentIndex += dayDetail;

            let hour = parseInt(date.substring(currentIndex, currentIndex + hourDetail));
            currentIndex += hourDetail;

            let minutes = parseInt(date.substring(currentIndex, currentIndex + minutesDetail));

            // console.log("year: " + year+" month: "+month+" day: "+day+" hour: "+hour+" minutes: " + minutes);

            this.addDatapoint(year, month, day, hour, minutes, speed, direction);
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

async function getWindSensorData(dataPromise) {
    // console.log("waiting for data promise");
    // console.log(dataPromise);
    const data = await dataPromise;
    let content;
    content = data.substring(data.indexOf("\n") + 1); // remove first line
    content = content.substring(0, content.lastIndexOf("\n")); // remove last line
    return content.split("\n");
    // console.log(sensor);
}

async function getWindSensors() {
    let sensors = {};
    const dataPromises = readFiles('../data/wind/');

    let sensorPromises = {};
    // console.log("data promises: ");
    // console.log(dataPromises);

    for (const [filename, dataPromise] of Object.entries(dataPromises)) {
        sensorPromises[filename] = getWindSensorData(dataPromise);
    }
    // console.log("sensor promises: ");
    // console.log(sensorPromises);
    for (const [filename, sensorPromise] of Object.entries(sensorPromises)) {
        let numId = extractSensorId(filename);
        if (sensors[numId] === undefined) {
            sensors[numId] = new WindSensor();
        }
        sensors[numId].storeMeasurements(await sensorPromise);
    }

    console.log(sensors);
    return sensors;
}

async function startWindAPI(sensorsPromise) {
    let sensors = await sensorsPromise;
    // console.log(sensors);
    let windDocumentation = "There are multiple stations:";

    app.get('/wind', (req, res) => {
        let doc = windDocumentation;
        for (const [key, value] of Object.entries(sensors)) {
            doc += "\n" + key;
        }
        res.send(doc);
    });

    app.get('/wind/:stationId', (req, res) => {
        res.send("Ask like this: http://localhost:3000/wind/4928/2020-1-8-16-20");
    });

    app.get('/wind/:stationId/:year-:month-:day-:hour-:minutes', (req, res) => {
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

async function getDustSensorData() {

}

async function startDustAPI() {
    let sensors = {};

    // const dataPromises = readFiles('../data/dust/');
    //
    // let sensorPromises = {};
    // // console.log("data promises: ");
    // // console.log(dataPromises);
    //
    // for (const [filename, dataPromise] of Object.entries(dataPromises)) {
    //     sensorPromises[filename] = getDustSensorData(dataPromise);
    // }
    // // console.log("sensor promises: ");
    // // console.log(sensorPromises);
    // for (const [filename, sensorPromise] of Object.entries(sensorPromises)) {
    //     let numId = extractSensorId(filename);
    //     if (sensors[numId] === undefined){
    //         sensors[numId] = new WindSensor();
    //     }
    //     sensors[numId].storeMeasurements(await sensorPromise);
    // }
    //
    // console.log(sensors);
    // let windDocumentation = "There are multiple stations:";
    //
    // app.get('/wind', (req, res) => {
    //     let doc = windDocumentation;
    //     for (const [key, value] of Object.entries(sensors)) {
    //         doc += "\n" + key;
    //     }
    //     res.send(doc);
    // });
    //
    // app.get('/wind/:stationId', (req, res) => {
    //     res.send("Ask like this: http://localhost:3000/wind/4928/2020-1-8-16-20");
    // });
    //
    // app.get('/wind/:stationId/:year-:month-:day-:hour-:minutes', (req, res) => {
    //     station = req.params['stationId'];
    //     year = req.params['year'];
    //     month = req.params['month'];
    //     day = req.params['day'];
    //     hour = req.params['hour'];
    //     minutes = req.params['minutes'];
    //     let sensor;
    //     try {
    //         sensor = sensors[station].measures[year][month][day][hour][minutes];
    //         // somehow necessary because hour: 30 40 50 ... and minutes 2 3 4 ... 200 300 400 all don't throw an error but are undefined
    //         // couldn't reproduce it with month
    //         if (sensor === undefined) {
    //             throw new Error();
    //         }
    //     } catch (err) {
    //         res.status(404);
    //         res.send("Station " + station + " or date [" + day + "." + month + "." + year + " " + hour + ":" + minutes + "] unknown");
    //     }
    //
    //     res.send(sensor);
    // });
}

async function startAPI() {
    const sensorsPromise = getWindSensors();
    startWindAPI(sensorsPromise);
    app.get('/', function(req, res) {
        res.sendFile(path.join(__dirname, '/../index.html'));

    });
    let outputPath = "../data/dust/";
    let ids = await getDustSensorIds('48.8,9.2,10');
    console.log("[" + Object.keys(ids).length + "]: " + Object.keys(ids)); // 1127 before filtering, 575 after
    let sensors = await sensorsPromise; //  necessary so that all wind dates are read, hopefully one can await twice

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
            }
            // waiting for one year of data to finish downloading to keep memory usage in place
            // somehow program doesn't reach this place until all files are downloaded but heap runs out without it. Meh
            while (activeDownloads.length > 0) {
                let activeDownload = activeDownloads.pop();
                console.log("waiting for active download");
                await activeDownload;
            }
            console.log("awaited all downloads for " + year);
        }
    }
    startDustAPI();
    
    app.get('/', (req, res) => res.send("Wind and Dust Archive API"));
}
startAPI();
//app.get('/air', (req,res) =>{
//}

app.listen(port, () => console.log(`Example on port ${port}`));
