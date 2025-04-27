document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  document.getElementById("currentRoleIndicator").textContent =
    currentUser.role === "foreman"
      ? `Вы вошли как: Бригадир (ID ${currentUser.id})`
      : "";

  // Функция для получения проверенных адресов
  async function fetchInspections(date) {
    const resp = await fetch(`/api/inspections?date=${date}`);
    return resp.ok ? resp.json() : [];
  }

  // Обновление статистики за день
  async function updateDailyStats() {
    const day = document.getElementById("daySelect").value;
    const stats = await fetch(`/api/inspections/stats?date=${day}`).then((r) =>
      r.json()
    );
    document.getElementById("housesCount").textContent = stats.housesCount;
    document.getElementById("housesCountBtn").textContent = stats.housesCount;
    document.getElementById("totalApartmentsCount").textContent =
      stats.totalApartmentsCount;
    document.getElementById("doneApartmentsCount").textContent =
      stats.doneApartmentsCount;

    document
      .getElementById("daySelect")
      .addEventListener("change", updateDailyStats);
  }

  // Открытие модального окна для адресов
  document
    .getElementById("showAddressesBtn")
    .addEventListener("click", async () => {
      const day = document.getElementById("daySelect").value; // Получаем дату из поля
      console.log("Выбранная дата для статистики:", day); // Логируем выбранную дату

      // Получаем данные о проверках за выбранный день
      const list = await fetchInspections(day); // Фильтруем записи по выбранной дате
      const addressesList = document.getElementById("addressesList");
      addressesList.innerHTML = ""; // Очищаем список

      if (!list.length) return alert("Нет данных за выбранный день!");

      // Группировка данных по адресу и суммирование проверенных квартир
      const groupedAddresses = {};

      list.forEach((ins) => {
        if (!groupedAddresses[ins.address]) {
          groupedAddresses[ins.address] = {
            totalDone: 0,
            totalApartments: 0,
            totalDoneAllTime: 0, // Суммируем все проверенные квартиры за все время
          };
        }

        // Суммируем только проверенные квартиры за выбранный день
        groupedAddresses[ins.address].totalDone += ins.total_done;
        // Сохраняем общее количество квартир для этого адреса
        groupedAddresses[ins.address].totalApartments = ins.total_apartments;
        // Суммируем все проверенные квартиры по этому адресу за все время
        groupedAddresses[ins.address].totalDoneAllTime += ins.total_done;
      });

      // Добавляем адреса и их данные в модальное окно
      for (let address in groupedAddresses) {
        const { totalDone, totalApartments, totalDoneAllTime } =
          groupedAddresses[address];
        const percentage = ((totalDone / totalApartments) * 100).toFixed(1);
        const percentageAllTime = (
          (totalDoneAllTime / totalApartments) *
          100
        ).toFixed(1);

        const div = document.createElement("div");
        div.className = "address-item";
        div.innerHTML = `
        <div class="address-info">
          <strong>${address}</strong><br>
          Квартир: ${totalDoneAllTime}/${totalApartments} (${percentageAllTime}%) + ${totalDone} / ${totalApartments} (${percentage}%)
        </div>
        <div class="address-actions">
          <button class="delete-btn" data-id="${address}">Удалить</button>
        </div>
      `;
        addressesList.appendChild(div);
      }

      // Обработчик для кнопки удаления
      document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const address = btn.dataset.id;
          if (!address) {
            console.error("Ошибка: ID не найден!");
            return;
          }

          if (confirm("Удалить?")) {
            const response = await fetch(
              `/api/inspections?address=${address}`,
              { method: "DELETE" }
            );

            if (response.ok) {
              await updateDailyStats();
              alert("Удалено");
            } else {
              alert("Ошибка удаления");
            }
          }
        });
      });

      // Открываем модальное окно
      document.getElementById("addressesModal").style.display = "block";
    }); // Закрытие обработчика события

  // Функция для получения проверок за день
  async function fetchInspections(date) {
    const resp = await fetch(`/api/inspections?date=${date}`);
    return resp.ok ? resp.json() : [];
  }

  // Закрытие модальных окон
  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("addressesModal").style.display = "none";
      document.getElementById("addressStatsModal").style.display = "none";
    });
  });

  // Обработчик для формы добавления данных обхода
  document
    .getElementById("addressForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      // Сохраняем данные для отправки
      const data = {
        address: document.getElementById("address").value,
        totalApartments: +document.getElementById("totalApartments").value,
        totalDone: +document.getElementById("apartmentsDone").value,
        date: document.getElementById("inspectionDate").value,
      };

      // Отправка данных на сервер
      const response = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        alert("Сохранено");

        // Обновляем статистику
        await updateDailyStats();

        // Очищаем только те поля, которые нужно сбросить
        document.getElementById("address").value = "";
        document.getElementById("totalApartments").value = "";
        document.getElementById("apartmentsDone").value = "";

        // Дата остаётся выбранной, она не сбрасывается
      } else {
        alert("Ошибка при сохранении данных");
      }
    });

  // Автозаполнение данных по количеству квартир при вводе адреса
  document.getElementById("address").addEventListener("blur", async () => {
    const address = document.getElementById("address").value;

    if (address) {
      // Запрос на сервер для получения проверок по данному адресу
      const inspections = await fetch(
        `/api/inspections?address=${address}`
      ).then((res) => res.json());

      // Проверка, если в базе есть хотя бы одна запись с таким адресом
      if (inspections.length > 0) {
        // В базе есть записи для данного адреса
        const firstInspection = inspections[0]; // Берем первую найденную запись (можно взять любую, если данных несколько)
        document.getElementById("totalApartments").value =
          firstInspection.total_apartments; // Заполняем поле количеством квартир
      } else {
        // Если адрес не найден, оставляем поле пустым
        document.getElementById("totalApartments").value = "";
      }
    }
  });

  // Обработчик для формы поиска пропущенных квартир
  document.getElementById("missingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const arr = document
      .getElementById("missingArr")
      .value.split(" ")
      .map(Number);
    const max = +document.getElementById("maxNumber").value;
    const missing = findMissingNumbers(arr, max);
    document.getElementById("missingResultBasic").innerHTML =
      "<h2>Пропущенные номера квартир:</h2>" + missing.join(", ");
    document.getElementById("missingResultGrouped").innerHTML =
      "<h2>Пропущенные номера (диапазоны):</h2>" +
      groupConsecutive(missing).join(", ");
  });

  // Функция для нахождения пропущенных номеров
  function findMissingNumbers(arr, maxNumber) {
    const full = Array.from({ length: maxNumber }, (_, i) => i + 1);
    return full.filter((n) => !arr.includes(n));
  }

  // Группировка пропущенных номеров
  function groupConsecutive(nums) {
    if (!nums.length) return [];
    const groups = [];
    let start = nums[0],
      prev = nums[0];
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== prev + 1) {
        groups.push(
          prev - start >= 4
            ? `${start} - ${prev}`
            : Array.from(
                { length: prev - start + 1 },
                (_, k) => start + k
              ).join(",")
        );
        start = nums[i];
      }
      prev = nums[i];
    }
    groups.push(
      prev - start >= 4
        ? `${start} - ${prev}`
        : Array.from({ length: prev - start + 1 }, (_, k) => start + k).join(
            ","
          )
    );
    return groups;
  }

  // Установка сегодняшней даты в поля формы
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("daySelect").value = today;
  document.getElementById("inspectionDate").value = today;
  updateDailyStats();

  // Обработчик для кнопки "Сегодня"
  document.getElementById("todayBtn").addEventListener("click", () => {
    document.getElementById("daySelect").value = today;
    updateDailyStats();
  });
}); // Закрытие слушателя DOMContentLoaded
