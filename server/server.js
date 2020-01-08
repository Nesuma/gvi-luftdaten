const express = require('express')
const app = express()
const port = 3000

var fs = require('fs');

let separator = ';';
let yearDetail = 4;
let monthDetail = 2;
let dayDetail = 2;
let hourDetail = 2;

let dateIndex = 1;
let speedIndex = 3;
let directionIndex = 4;

class WindSensor {
    constructor(id) {
        this.id = id;
        this.measures = [];
    }

    addDatapoint(year, month, day, hour, speed, direction) {
        if (this.measures[year] === undefined) {
            this.measures[year] = [];
        }
        if (this.measures[year][month] === undefined) {
            this.measures[year][month] = [];
        }
        if (this.measures[year][month][day] === undefined) {
            this.measures[year][month][day] = [];
        }
        this.measures[year][month][day][hour] = { speed: speed, direction: direction };
        // console.log("added: " + year + "-" +month+ "-" +day+ "-" +hour+ "-" +speed+ "-" +direction)
        // console.log(this.measures[year][month][day][hour]);
    }

    storeMeasurements(content) {
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

            // console.log("year: " + year+" month: "+month+" day: "+day+" hour: "+hour);

            this.addDatapoint(year, month, day, hour, speed, direction);
        }
    }
}

function extractNumericalId(id) {
    return parseInt(id.substring(0, id.indexOf('.')));
}

function getLinesFromFile(fileSystem, filePath) {
    var content = fs.readFileSync(filePath, 'utf8');
    // cut the first line
    content = content.substring(content.indexOf("\n") + 1);
    // cut the last line
    content = content.substring(0, content.lastIndexOf("\n"));
    return content.split("\n");
}

// hier würde man dann die zip vom dwd mit der sensor nummer runterladen und entpacken

// produkt datei einlesen
let measurementsFile = "04928.txt";
let numId = extractNumericalId(measurementsFile);

let content = getLinesFromFile(fs, measurementsFile);

let sensor = new WindSensor(numId);
sensor.storeMeasurements(content);

let sensors = {};
sensors[numId] = sensor;

// example request http://localhost:3000/4928?year=2018&month=9&day=13&hour=4
app.get('/', (req, res) => res.send(content));
app.get('/wind', (req, res) => {
    let station = req.query.station;
    let year = req.query.year;
    let month = req.query.month;
    let day = req.query.day;
    let hour = req.query.hour;
    res.send(sensors[station].measures[year][month][day][hour]);
});

//app.get('/air', (req,res) =>{

//}

app.listen(port, () => console.log(`Example on port ${port}`));
