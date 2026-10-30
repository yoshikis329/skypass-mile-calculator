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
    document.getElementById('cabin').addEventListener('change', updateReservationClassOptions);
    updateCabinOptions();
});

const calc = async () => {
    const origin = document.getElementById('origin').value.trim().toUpperCase();
    const via = document.getElementById('via').value.trim().toUpperCase();
    const destination = document.getElementById('destination').value.trim().toUpperCase();
    const outboundReservationClass = document.getElementById('outboundReservationClass').value;
    const returnReservationClass = document.getElementById('returnReservationClass').value;
    const airlineCode = document.getElementById('airline').value;
    const cabin = document.getElementById('cabin').value;
    const price = Number(document.getElementById('price').value);
    const result = document.getElementById('result');

    result.textContent = '';

    if (!cabin && document.getElementById('cabin').disabled) {
        showMessage('選択した航空会社の積算率データが登録されていないため、計算できません。');
        return;
    }
    if (!origin || !destination || !outboundReservationClass || !returnReservationClass || !cabin || document.getElementById('price').value === '') {
        showMessage('出発地、目的地、客室クラス、往復それぞれの予約クラス、往復航空券の金額を入力してください。');
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
        const outboundRate = getReservationClassRate(cabinRates, outboundReservationClass, '往路', airline.name, cabinLabels[cabin]);
        const returnRate = getReservationClassRate(cabinRates, returnReservationClass, '復路', airline.name, cabinLabels[cabin]);
        const outboundCodes = via ? [origin, via, destination] : [origin, destination];
        const missingCode = outboundCodes.find(code => !airports.has(code));
        if (missingCode) {
            throw new Error(`空港コード「${missingCode}」が見つかりません。`);
        }

        const outboundSegments = createSegments(outboundCodes, airports);
        const returnSegments = createSegments([...outboundCodes].reverse(), airports);
        const outboundDistance = totalSegmentMiles(outboundSegments);
        const returnDistance = totalSegmentMiles(returnSegments);
        const totalDistance = outboundDistance + returnDistance;
        const outboundEarnedMiles = Math.floor(outboundDistance * outboundRate);
        const returnEarnedMiles = Math.floor(returnDistance * returnRate);
        const earnedMiles = outboundEarnedMiles + returnEarnedMiles;
        const pricePerMile = earnedMiles > 0 ? price / earnedMiles : null;

        renderResult(
            outboundSegments,
            returnSegments,
            totalDistance,
            airline.name,
            cabinLabels[cabin],
            outboundReservationClass,
            outboundRate,
            outboundEarnedMiles,
            returnReservationClass,
            returnRate,
            returnEarnedMiles,
            earnedMiles,
            pricePerMile
        );
    } catch (error) {
        showMessage(error.message || '空港データを取得できませんでした。通信環境を確認して再度お試しください。');
    }
};

const getReservationClassRate = (cabinRates, reservationClass, direction, airlineName, cabinName) => {
    if (!Object.hasOwn(cabinRates, reservationClass)) {
        throw new Error(`${airlineName}の${cabinName}、${direction}予約クラス「${reservationClass}」の積算率は登録されていません。路線などの条件により率が異なる場合があります。`);
    }
    const rate = cabinRates[reservationClass];
    if (rate === 0) {
        throw new Error(`${direction}の予約クラス「${reservationClass}」はマイル積算対象外です。`);
    }
    return rate;
};

const createSegments = (codes, airports) => codes.slice(1).map((code, index) => ({
    from: codes[index],
    to: code,
    miles: Math.round(distanceInMiles(airports.get(codes[index]), airports.get(code)))
}));

const totalSegmentMiles = segments => segments.reduce((sum, segment) => sum + segment.miles, 0);

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
        updateReservationClassOptions();
    } catch (error) {
        cabinSelect.disabled = true;
        updateReservationClassOptions();
        showMessage(error.message || 'マイル加算率を読み込めませんでした。');
    }
};

const updateReservationClassOptions = async () => {
    const airlineCode = document.getElementById('airline').value;
    const cabin = document.getElementById('cabin').value;
    const reservationClassSelects = [
        document.getElementById('outboundReservationClass'),
        document.getElementById('returnReservationClass')
    ];

    try {
        const rateData = await loadMileageRates();
        const reservationRates = rateData.airlines[airlineCode]?.cabins[cabin] || {};
        for (const select of reservationClassSelects) {
            select.replaceChildren(new Option('選択してください', ''));
            for (const [reservationClass, rate] of Object.entries(reservationRates)) {
                const label = rate === 0
                    ? `${reservationClass}（積算対象外）`
                    : `${reservationClass}（${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%）`;
                select.add(new Option(label, reservationClass));
            }
        }
    } catch (error) {
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

const renderResult = (
    outboundSegments,
    returnSegments,
    totalDistance,
    airlineName,
    cabinName,
    outboundReservationClass,
    outboundRate,
    outboundEarnedMiles,
    returnReservationClass,
    returnRate,
    returnEarnedMiles,
    earnedMiles,
    pricePerMile
) => {
    const result = document.getElementById('result');
    result.textContent = '';

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    const sections = [
        {
            title: '航空券情報',
            className: 'result-section--info',
            rows: [
                ['航空会社', airlineName],
                ['客室クラス', cabinName]
            ]
        },
        {
            title: `往路（予約クラス ${outboundReservationClass}）`,
            className: 'result-section--outbound',
            rows: [
                [`予約クラス ${outboundReservationClass} の積算率`, `${(outboundRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`],
                ...outboundSegments.map(segment => [`${segment.from} → ${segment.to} の区間マイル`, `${segment.miles.toLocaleString()} マイル`]),
                ['往路の獲得マイル', `${outboundEarnedMiles.toLocaleString()} マイル`]
            ]
        },
        {
            title: `復路（予約クラス ${returnReservationClass}）`,
            className: 'result-section--return',
            rows: [
                [`予約クラス ${returnReservationClass} の積算率`, `${(returnRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`],
                ...returnSegments.map(segment => [`${segment.from} → ${segment.to} の区間マイル`, `${segment.miles.toLocaleString()} マイル`]),
                ['復路の獲得マイル', `${returnEarnedMiles.toLocaleString()} マイル`]
            ]
        },
        {
            title: '往復合計',
            className: 'result-section--total',
            rows: [
                ['合計区間マイル', `${totalDistance.toLocaleString()} マイル`],
                ['往復の獲得マイル合計', `${earnedMiles.toLocaleString()} マイル`],
                ['マイル単価', pricePerMile === null ? '計算できません' : `${pricePerMile.toFixed(2)} 円/マイル`]
            ]
        }
    ];

    for (const section of sections) {
        const headingRow = table.insertRow();
        headingRow.className = `result-section ${section.className}`;
        const heading = document.createElement('th');
        heading.colSpan = 2;
        heading.scope = 'colgroup';
        heading.textContent = section.title;
        headingRow.appendChild(heading);

        for (const [label, value] of section.rows) {
            const row = table.insertRow();
            for (const text of [label, value]) {
                const cell = row.insertCell();
                cell.textContent = text;
            }
        }
    }
    result.appendChild(table);
};

const showMessage = message => {
    document.getElementById('result').textContent = message;
};