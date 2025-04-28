document.addEventListener("DOMContentLoaded", () => {
  const foremenList = document.getElementById("foremenList");
  const updateButton = document.getElementById("updateChart");
  let selectedForeman = "all";
  let chart;

  // Форматирование даты для отображения в формате DD-MM-YYYY
  function formatDisplayDate(dateString) {
    const date = new Date(dateString);
    const options = { day: "2-digit", month: "2-digit", year: "numeric" };
    return date.toLocaleDateString("ru-RU", options);
  }

  fetch("/api/foremen")
    .then((r) => r.json())
    .then((list) => {
      list.forEach((f, index) => {
        const div = document.createElement("div");
        div.className = "brigade-option";
        div.dataset.foremanId = f.id;
        div.textContent = `Бригада ${index + 1}`;
        foremenList.appendChild(div);
      });
      attachHandlers();
      updateChartAndStats();
    });

  function attachHandlers() {
    document.querySelectorAll(".brigade-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        document
          .querySelectorAll(".brigade-option")
          .forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        selectedForeman = opt.dataset.foremanId;
        updateChartAndStats();
      });
    });

    // Добавляем обработчик для обновления данных при изменении дат
    document
      .getElementById("startDate")
      .addEventListener("change", updateChartAndStats);
    document
      .getElementById("endDate")
      .addEventListener("change", updateChartAndStats);
    updateButton.addEventListener("click", updateChartAndStats);
  }

  // Установка дат начала и конца текущего месяца
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 2); // Первый день месяца
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1); // Последний день месяца

  // Форматируем даты в формат DD-MM-YYYY
  document.getElementById("startDate").value = startDate
    .toISOString()
    .split("T")[0];
  document.getElementById("endDate").value = endDate
    .toISOString()
    .split("T")[0];

  async function updateChartAndStats() {
    const start = document.getElementById("startDate").value;
    const end = document.getElementById("endDate").value;
    if (!start || !end) return alert("Выберите диапазон дат");

    const url = new URL("/api/inspections", location.origin);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("foreman_id", selectedForeman);

    const data = await fetch(url).then((r) => r.json());

    document.getElementById("periodRange").textContent = `${formatDisplayDate(
      start
    )} - ${formatDisplayDate(end)}`; // Отображаем выбранные даты в сводной статистике
    document.getElementById("totalHouses").textContent = data.length;
    document.getElementById("totalApartments").textContent = data.reduce(
      (s, r) => s + r.total_apartments,
      0
    );
    document.getElementById("totalDone").textContent = data.reduce(
      (s, r) => s + r.total_done,
      0
    );

    // Сортируем данные по датам
    data.sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = [...new Set(data.map((r) => r.date))];
    const foremenData = {};

    // Группировка данных по бригадам и датам
    data.forEach((r) => {
      const key = `${r.date}-${r.foreman_id}`; // Группировка по дате и бригаде
      if (!foremenData[r.foreman_id]) {
        foremenData[r.foreman_id] = {
          foremanId: r.foreman_id,
          dates: {},
        };
      }
      if (!foremenData[r.foreman_id].dates[r.date]) {
        foremenData[r.foreman_id].dates[r.date] = 0;
      }
      foremenData[r.foreman_id].dates[r.date] += r.total_done; // Суммируем только проверенные квартиры за день
    });

    // Уникальные наборы данных для графика
    const datasets = Object.keys(foremenData).map((foremanId, index) => {
      const foreman = foremenData[foremanId];
      return {
        label: `Бригада ${foreman.foremanId}`,
        data: labels.map((date) => foreman.dates[date] || 0),
        borderColor: getColor(index),
        backgroundColor: getColor(index, true),
        fill: true,
      };
    });

    const formattedLabels = labels.map((date) => formatDisplayDate(date));

    // Перерисовываем график
    if (chart) chart.destroy();
    chart = new Chart(
      document.getElementById("apartmentsChart").getContext("2d"),
      {
        type: "bar",
        data: { labels: formattedLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              title: {
                display: true,
                text: "Дата",
                font: {
                  size: 14,
                },
              },
            },
            y: {
              title: {
                display: true,
                text: "Количество проверенных квартир",
                font: {
                  size: 14,
                },
              },
              beginAtZero: true,
            },
          },
        },
      }
    );

    // Обновление таблицы с детализацией по дням
    const tbody = document.querySelector("#detailsTable tbody");
    tbody.innerHTML = "";

    // Проходим по данным и группируем их по бригадам и датам
    const groupedByDayAndForeman = {};

    data.forEach((r) => {
      const key = `${r.date}-${r.foreman_id}`;
      if (!groupedByDayAndForeman[key]) {
        groupedByDayAndForeman[key] = {
          foremanId: r.foreman_id,
          date: r.date,
          totalHouses: new Set(),
          totalApartments: 0,
          totalDone: 0,
        };
      }
      groupedByDayAndForeman[key].totalHouses.add(r.address);
      groupedByDayAndForeman[key].totalApartments += r.total_apartments;
      groupedByDayAndForeman[key].totalDone += r.total_done;
    });

    // Заполнение таблицы
    Object.values(groupedByDayAndForeman).forEach((group) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${formatDisplayDate(group.date)}</td>
        <td>Бригада ${group.foremanId}</td>
        <td>${group.totalHouses.size}</td>
        <td>${group.totalApartments}</td>
        <td>${group.totalDone}</td>`;
      tbody.appendChild(tr);
    });
  }

  function getColor(index, isBackground = false) {
    const colors = ["#005B96", "#006C99", "#008CBA", "#00A6B2", "#33B5E5"]; // Насыщенные синие и голубые оттенки
    return isBackground
      ? colors[index % colors.length] + "80"
      : colors[index % colors.length];
  }
});
