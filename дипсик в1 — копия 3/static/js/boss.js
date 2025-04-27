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

    const labels = [...new Set(data.map((r) => r.date))];
    const foremenData = {};

    data.forEach((r) => {
      if (!foremenData[r.foreman_id]) {
        foremenData[r.foreman_id] = { dates: [], done: [] };
      }
      foremenData[r.foreman_id].dates.push(r.date);
      foremenData[r.foreman_id].done.push(r.total_done);
    });

    // Обновление графика для каждой бригады
    const datasets = Object.keys(foremenData).map((foremanId, index) => ({
      label: `Бригада ${foremanId}`,
      data: labels.map((date) => {
        const index = foremenData[foremanId].dates.indexOf(date);
        return index !== -1 ? foremenData[foremanId].done[index] : 0;
      }),
      borderColor: getColor(index), // Получение уникального цвета для каждой бригады
      backgroundColor: getColor(index, true),
      fill: true,
    }));

    // Применяем форматирование даты для отображения по оси X
    const formattedLabels = labels.map((date) => formatDisplayDate(date));

    // Теперь строим график с отформатированными датами для оси X
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

    // Обновление таблицы
    const tbody = document.querySelector("#detailsTable tbody");
    tbody.innerHTML = "";

    // Создаем объект для хранения уникальных адресов для каждой бригады
    const foremanAddresses = {};

    // Проходим по всем данным
    data.forEach((r) => {
      // Инициализируем массив для адресов бригады, если еще не существует
      if (!foremanAddresses[r.foreman_id]) {
        foremanAddresses[r.foreman_id] = new Set();
      }

      // Добавляем адрес в Set для текущей бригады
      foremanAddresses[r.foreman_id].add(r.address);

      // Создаем строку таблицы для текущего обхода
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDisplayDate(r.date)}</td> 
        <td>Бригада ${r.foreman_id}</td>
        <td>${
          foremanAddresses[r.foreman_id].size
        }</td>  <!-- Количество уникальных адресов (домов) -->
        <td>${r.total_apartments}</td>
        <td>${r.total_done}</td>`;

      // Добавляем строку в таблицу
      tbody.appendChild(tr);
    });
  }

  function getColor(index, isBackground = false) {
    // Используем более глубокие оттенки
    const colors = ["#005B96", "#006C99", "#008CBA", "#00A6B2", "#33B5E5"]; // Насыщенные синие и голубые оттенки
    return isBackground
      ? colors[index % colors.length] + "80"
      : colors[index % colors.length];
  }
});
