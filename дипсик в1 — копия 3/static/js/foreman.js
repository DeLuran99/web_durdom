document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  document.getElementById('currentRoleIndicator').textContent =
    currentUser.role === 'foreman'
      ? `Вы вошли как: Бригадир (ID ${currentUser.id})`
      : '';

  // Функция для получения проверенных адресов
  async function fetchInspections(date) {
    const resp = await fetch(`/api/inspections?date=${date}`);
    return resp.ok ? resp.json() : [];
  }

  // Обновление статистики за день
  async function updateDailyStats() {
    const day = document.getElementById('daySelect').value;
    const stats = await fetch(`/api/inspections/stats?date=${day}`).then(r => r.json());
    document.getElementById('housesCount').textContent = stats.housesCount;
    document.getElementById('housesCountBtn').textContent = stats.housesCount;
    document.getElementById('totalApartmentsCount').textContent = stats.totalApartmentsCount;
    document.getElementById('doneApartmentsCount').textContent = stats.doneApartmentsCount;
  }

  // Открытие модального окна для адресов
  document.getElementById('showAddressesBtn').addEventListener('click', async () => {
    const day = document.getElementById('daySelect').value;
    const list = await fetchInspections(day);
    const addressesList = document.getElementById('addressesList');
    addressesList.innerHTML = '';

    if (!list.length) return alert('Нет данных за выбранный день!');

    list.forEach(ins => {
      const div = document.createElement('div');
      div.className = 'address-item';
      div.innerHTML = `
        <div class="address-info">
          <strong>${ins.address}</strong><br>
          Квартир: ${ins.total_done}/${ins.total_apartments} (${((ins.total_done / ins.total_apartments) * 100).toFixed(1)}%)
        </div>
        <div class="address-actions">
          <button class="stats-btn" data-id="${ins.id}">Статистика</button>
          <button class="delete-btn" data-id="${ins.id}">Удалить</button>
        </div>
      `;
      addressesList.appendChild(div);
    });

    // Обработчик для кнопки статистики
    document.querySelectorAll('.stats-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const list = await fetchInspections(document.getElementById('daySelect').value);
        const ins = list.find(x => x.id == id);
        const pct = ((ins.total_done / ins.total_apartments) * 100).toFixed(1);

        document.getElementById('addressStatsContent').innerHTML = `
          <h3>${ins.address}</h3>
          <p>Дата: ${ins.date}</p>
          <p>Квартир: ${ins.total_done}/${ins.total_apartments} (${pct}%)</p>`;

        document.getElementById('addressStatsModal').style.display = 'block';
      });
    });

    // Обработчик для кнопки удаления
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) {
          console.error('Ошибка: ID не найден!');
          return;
        }

        if (confirm('Удалить?')) {
          const response = await fetch(`/api/inspections/${id}`, { method: 'DELETE' });

          if (response.ok) {
            await updateDailyStats();
            alert('Удалено');
          } else {
            alert('Ошибка удаления');
          }
        }
      });
    });

    document.getElementById('addressesModal').style.display = 'block';
  });

  // Закрытие модальных окон
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('addressesModal').style.display = 'none';
      document.getElementById('addressStatsModal').style.display = 'none';
    });
  });

  // Обработчик для формы добавления данных обхода
  document.getElementById('addressForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      address: document.getElementById('address').value,
      totalApartments: +document.getElementById('totalApartments').value,
      totalDone: +document.getElementById('apartmentsDone').value,
      date: document.getElementById('inspectionDate').value
    };
    const response = await fetch('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      alert('Сохранено');
      await updateDailyStats();
      document.getElementById('addressForm').reset();
    } else {
      alert('Ошибка при сохранении данных');
    }
  });

  // Автозаполнение данных по количеству квартир при вводе адреса
  document.getElementById('address').addEventListener('blur', async () => {
    const address = document.getElementById('address').value;
    if (address) {
      const inspections = await fetch(`/api/inspections?address=${address}`).then(res => res.json());
      if (inspections.length > 0) {
        const lastInspection = inspections[inspections.length - 1];
        document.getElementById('totalApartments').value = lastInspection.total_apartments;
      }
    }
  });

  // Обработчик для формы поиска пропущенных квартир
  document.getElementById('missingForm').addEventListener('submit', e => {
    e.preventDefault();
    const arr = document.getElementById('missingArr').value.split(' ').map(Number);
    const max = +document.getElementById('maxNumber').value;
    const missing = findMissingNumbers(arr, max);
    document.getElementById('missingResultBasic').innerHTML =
      '<h2>Пропущенные номера квартир:</h2>' + missing.join(', ');
    document.getElementById('missingResultGrouped').innerHTML =
      '<h2>Пропущенные номера (диапазоны):</h2>' + groupConsecutive(missing).join(', ');
  });

  // Функция для нахождения пропущенных номеров
  function findMissingNumbers(arr, maxNumber) {
    const full = Array.from({ length: maxNumber }, (_, i) => i + 1);
    return full.filter(n => !arr.includes(n));
  }

  // Группировка пропущенных номеров
  function groupConsecutive(nums) {
    if (!nums.length) return [];
    const groups = [];
    let start = nums[0], prev = nums[0];
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== prev + 1) {
        groups.push(prev - start >= 4
          ? `${start} - ${prev}`
          : Array.from({ length: prev - start + 1 }, (_, k) => start + k).join(','));
        start = nums[i];
      }
      prev = nums[i];
    }
    groups.push(prev - start >= 4
      ? `${start} - ${prev}`
      : Array.from({ length: prev - start + 1 }, (_, k) => start + k).join(','));
    return groups;
  }

  // Установка сегодняшней даты в поля формы
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('daySelect').value = today;
  document.getElementById('inspectionDate').value = today;
  updateDailyStats();

  // Обработчик для кнопки "Сегодня"
  document.getElementById('todayBtn').addEventListener('click', () => {
    document.getElementById('daySelect').value = today;
    updateDailyStats();
  });
});
