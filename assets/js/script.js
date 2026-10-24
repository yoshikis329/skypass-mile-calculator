const AIRPORT_DATA_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const EARTH_RADIUS_MILES = 3958.7613;
let airportDataPromise;
let mileageRatesPromise;

const cabinLabels = {
    economy: 'エコノミークラス',
    premiumEconomy: 'プレミアムエコノミー',
    business: 'ビジネスクラス',
    first: 'ファーストクラス'
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('airline').addEventListener('change', updateCabinOptions);
    updateCabinOptions();
});

const calc = async () => {
    const origin = document.getElementById('origin').value.trim().toUpperCase();
    const via = document.getElementById('via').value.trim().toUpperCase();
    const destination = document.getElementById('destination').value.trim().toUpperCase();
    const reservationClass = document.getElementById('reservationClass').value.trim().toUpperCase();
    const airlineCode = document.getElementById('airline').value;
    const cabin = document.getElementById('cabin').value;
    const price = Number(document.getElementById('price').value);
    const result = document.getElementById('result');

    result.textContent = '';

    if (!cabin && document.getElementById('cabin').disabled) {
        showMessage('選択した航空会社の積算率データが登録されていないため、計算できません。');
        return;
    }
    if (!origin || !destination || !reservationClass || !cabin || document.getElementById('price').value === '') {
        showMessage('出発地、目的地、客室クラス、予約クラス、飛行機の金額を入力してください。');
        return;
    }
    if (!/^[A-Z]{3}$/.test(origin) || (via && !/^[A-Z]{3}$/.test(via)) || !/^[A-Z]{3}$/.test(destination)) {
        showMessage('空港コードは3文字で入力してください。');
        return;
    }
    if (!Number.isFinite(price) || price < 0) {
        showMessage('飛行機の金額は0以上の数値を入力してください。');
        return;
    }

    showMessage('計算中...');

    try {
        const [airports, rateData] = await Promise.all([loadAirports(), loadMileageRates()]);
        const airline = rateData.airlines[airlineCode];
        if (!airline) {
            throw new Error('選択した航空会社の積算率データがありません。');
        }
        const cabinRates = airline.cabins[cabin];
        if (!cabinRates) {
            throw new Error(`${airline.name}の${cabinLabels[cabin] || cabin}の積算率データは登録されていません。`);
        }
        if (!Object.hasOwn(cabinRates, reservationClass)) {
            throw new Error(`${airline.name}の${cabinLabels[cabin]}、予約クラス「${reservationClass}」の積算率は登録されていません。路線などの条件により率が異なる場合があります。`);
        }
        const rate = cabinRates[reservationClass];
        if (rate === 0) {
            throw new Error('この予約クラスはマイル積算対象外です。');
        }

        const codes = via ? [origin, via, destination] : [origin, destination];
        const missingCode = codes.find(code => !airports.has(code));
        if (missingCode) {
            throw new Error(`空港コード「${missingCode}」が見つかりません。`);
        }

        const segments = codes.slice(1).map((code, index) => ({
            from: codes[index],
            to: code,
            miles: Math.round(distanceInMiles(airports.get(codes[index]), airports.get(code)))
        }));
        const totalDistance = segments.reduce((sum, segment) => sum + segment.miles, 0);
        const earnedMiles = Math.floor(totalDistance * rate);
        const pricePerMile = earnedMiles > 0 ? price / earnedMiles : null;

        renderResult(segments, totalDistance, airline.name, cabinLabels[cabin], reservationClass, rate, earnedMiles, pricePerMile);
    } catch (error) {
        showMessage(error.message || '空港データを取得できませんでした。通信環境を確認して再度お試しください。');
    }
};

const loadMileageRates = async () => {
    if (!mileageRatesPromise) {
        mileageRatesPromise = fetch('./data/mileage-rates.json').then(response => {
            if (!response.ok) {
                throw new Error('マイル加算率JSONを読み込めませんでした。');
            }
            return response.json();
        }).catch(error => {
            mileageRatesPromise = null;
            throw error;
        });
    }
    return mileageRatesPromise;
};

const updateCabinOptions = async () => {
    const airlineSelect = document.getElementById('airline');
    const cabinSelect = document.getElementById('cabin');
    cabinSelect.replaceChildren();

    try {
        const rateData = await loadMileageRates();
        const cabins = rateData.airlines[airlineSelect.value]?.cabins || {};
        for (const cabin of Object.keys(cabins)) {
            const option = document.createElement('option');
            option.value = cabin;
            option.textContent = cabinLabels[cabin] || cabin;
            cabinSelect.appendChild(option);
        }
        if (cabinSelect.options.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'レート未登録';
            cabinSelect.appendChild(option);
            cabinSelect.disabled = true;
        } else {
            cabinSelect.disabled = false;
        }
    } catch (error) {
        cabinSelect.disabled = true;
        showMessage(error.message || 'マイル加算率を読み込めませんでした。');
    }
};

const loadAirports = async () => {
    if (!airportDataPromise) {
        airportDataPromise = fetch(AIRPORT_DATA_URL).then(response => {
            if (!response.ok) {
                throw new Error('空港データを取得できませんでした。通信環境を確認して再度お試しください。');
            }
            return response.text();
        }).then(parseAirportData).catch(error => {
            airportDataPromise = null;
            throw error;
        });
    }
    return airportDataPromise;
};

const parseAirportData = csv => {
    const airports = new Map();
    for (const line of csv.split(/\r?\n/)) {
        const fields = parseCsvRow(line);
        const code = fields[4];
        const latitude = Number(fields[6]);
        const longitude = Number(fields[7]);
        if (/^[A-Z]{3}$/.test(code) && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            airports.set(code, { latitude, longitude });
        }
    }
    return airports;
};

const parseCsvRow = line => {
    const fields = [];
    let value = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (insideQuotes && line[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (character === ',' && !insideQuotes) {
            fields.push(value);
            value = '';
        } else {
            value += character;
        }
    }
    fields.push(value);
    return fields;
};

const distanceInMiles = (from, to) => {
    const toRadians = degrees => degrees * Math.PI / 180;
    const latitudeDifference = toRadians(to.latitude - from.latitude);
    const longitudeDifference = toRadians(to.longitude - from.longitude);
    const value = Math.sin(latitudeDifference / 2) ** 2
        + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude))
        * Math.sin(longitudeDifference / 2) ** 2;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(value));
};

const renderResult = (segments, totalDistance, airlineName, cabinName, reservationClass, rate, earnedMiles, pricePerMile) => {
    const result = document.getElementById('result');
    result.textContent = '';

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    const rows = [
        ['航空会社', airlineName],
        ['客室クラス', cabinName],
        ...segments.map(segment => [`${segment.from} → ${segment.to} の区間マイル`, `${segment.miles.toLocaleString()} マイル`]),
        ['合計区間マイル', `${totalDistance.toLocaleString()} マイル`],
        [`予約クラス ${reservationClass} の積算率`, `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`],
        ['獲得マイル', `${earnedMiles.toLocaleString()} マイル`],
        ['マイル単価', pricePerMile === null ? '計算できません' : `${pricePerMile.toFixed(2)} 円/マイル`]
    ];

    for (const [label, value] of rows) {
        const row = table.insertRow();
        for (const text of [label, value]) {
            const cell = row.insertCell();
            cell.textContent = text;
            cell.style.border = '1px solid black';
            cell.style.padding = '8px';
        }
    }
    result.appendChild(table);
};

const showMessage = message => {
    document.getElementById('result').textContent = message;
};