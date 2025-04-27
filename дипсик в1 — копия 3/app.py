import os
from time import sleep
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import date, datetime, timedelta
from sqlalchemy.exc import OperationalError

# Абсолютный путь к файлу БД
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'app.db')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ваш_секретный_ключ'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path + '?check_same_thread=False'
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'connect_args': {
        'timeout': 15
    }
}

db = SQLAlchemy(app)

# Функция для обработки коммитов с повторной попыткой
def commit_with_retry():
    retries = 3
    for _ in range(retries):
        try:
            db.session.commit()
            break
        except OperationalError:
            print("Ошибка базы данных: база данных заблокирована. Попытка повторить...")
            db.session.rollback()  # Откатить транзакцию
            sleep(1)
        except Exception as e:
            print(f"Неизвестная ошибка при сохранении данных: {e}")
            db.session.rollback()  # Откатить транзакцию
            break

# Функция для получения первой и последней даты текущего месяца
def get_start_end_of_month():
    today = datetime.today()
    start_of_month = today.replace(day=1)
    next_month = start_of_month.replace(month=today.month % 12 + 1, day=1)
    end_of_month = next_month - timedelta(days=1)
    return start_of_month, end_of_month

# Модели
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    login = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False)

class Inspection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    foreman_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    foreman = db.relationship('User', backref='inspections')
    address = db.Column(db.String(200), nullable=False)
    total_apartments = db.Column(db.Integer, nullable=False)
    total_done = db.Column(db.Integer, nullable=False)
    date = db.Column(db.Date, nullable=False)

# --------------------------------
# Маршруты рендеринга страниц
# --------------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth')
def auth_page():
    return render_template('auth.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/reset-password')
def reset_password():
    return render_template('reset-password.html')

@app.route('/boss')
def boss_page():
    if session.get('role') == 'boss':
        # Получаем текущие даты начала и конца месяца для роли boss
        start, end = get_start_end_of_month()
        return render_template('boss.html', start_date=start.date(), end_date=end.date())
    return redirect(url_for('auth_page'))

@app.route('/foreman')
def foreman_page():
    if session.get('role') == 'foreman':
        return render_template('foreman.html')
    return redirect(url_for('auth_page'))

# --------------------------------
# API: регистрация / логин
# --------------------------------
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    if data.get('role') not in ('boss', 'foreman'):
        return jsonify({'error': 'Неверная роль'}), 400
    if User.query.filter_by(login=data['login']).first():
        return jsonify({'error': 'Логин занят'}), 400
    user = User(
        login    = data['login'],
        password = generate_password_hash(data['password']),
        role     = data['role']
    )
    db.session.add(user)
    commit_with_retry()  # Использование повторных попыток для сохранения данных
    return jsonify({'success': True})

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    user = User.query.filter_by(login=data['login']).first()
    if not user or not check_password_hash(user.password, data['password']):
        return jsonify({'error': 'Неверные учетные данные'}), 401
    session['user_id'] = user.id
    session['role']    = user.role
    return jsonify({'id': user.id, 'login': user.login, 'role': user.role})

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth_page'))

# --------------------------------
# API: список бригадиров (boss)
# --------------------------------
@app.route('/api/foremen', methods=['GET'])
def get_foremen():
    if session.get('role') != 'boss':
        return jsonify({'error': 'Нет доступа'}), 403
    foremen = User.query.filter_by(role='foreman').all()
    return jsonify([{'id': f.id, 'login': f.login} for f in foremen])

# --------------------------------
# API: CRUD обходов
# --------------------------------
@app.route('/api/inspections', methods=['POST'])
def save_inspection():
    if session.get('role') != 'foreman':
        return jsonify({'error': 'Нет доступа'}), 403
    d = request.json
    # Проверка на данные, чтобы избежать ошибок при их сохранении
    if not all(key in d for key in ['address', 'totalApartments', 'totalDone', 'date']):
        return jsonify({'error': 'Неверные данные'}), 400
    insp = Inspection(
        foreman_id=session['user_id'],
        address=d['address'],
        total_apartments=d['totalApartments'],
        total_done=d['totalDone'],
        date=date.fromisoformat(d['date'])
    )
    db.session.add(insp)
    commit_with_retry()  # Использование повторных попыток для сохранения данных
    return jsonify({'success': True})

@app.route('/api/inspections', methods=['GET'])
def get_inspections():
    user_role = session.get('role')
    foreman_id = session.get('user_id')  # Получаем ID текущего пользователя
    start = request.args.get('start')
    end = request.args.get('end')
    foreman_id_param = request.args.get('foreman_id')  # Фильтрация по foreman_id
    address = request.args.get('address')  # Получаем адрес из параметров запроса

    # Если это роль boss, то устанавливаем даты по умолчанию
    if user_role == 'boss' and not start and not end:
        start, end = get_start_end_of_month()
        start = start.date().isoformat()
        end = end.date().isoformat()

    # Фильтруем данные по выбранным датам
    q = Inspection.query

    # Фильтрация для роли boss
    if user_role == 'boss':
        if start and end:
            q = q.filter(Inspection.date.between(start, end))
        if foreman_id_param and foreman_id_param != 'all':
            foreman_id_param = int(foreman_id_param)  # ID бригадира
            q = q.filter_by(foreman_id=foreman_id_param)

    # Фильтрация для роли foreman
    elif user_role == 'foreman':
        q = q.filter_by(foreman_id=foreman_id)
        if start and end:
            q = q.filter(Inspection.date.between(start, end))

    # Фильтрация по адресу (если передан адрес)
    if address:
        q = q.filter(Inspection.address == address)

    # Получаем все записи
    recs = q.all()

    # Формируем ответ с данными по проверкам
    return jsonify([{
        'date': r.date.isoformat(),
        'foreman_id': r.foreman_id - 1,  # Вычитаем 1, чтобы ID начиналось с 1
        'foreman_login': f'Бригада {r.foreman_id}',  # Показываем "Бригада 1", "Бригада 2" и т.д.
        'address': r.address,
        'total_apartments': r.total_apartments,
        'total_done': r.total_done
    } for r in recs])


@app.route('/api/inspections/<int:id>', methods=['DELETE'])
def delete_inspection(id):
    insp = Inspection.query.get_or_404(id)
    if (session.get('role') == 'boss' or
        (session.get('role') == 'foreman' and insp.foreman_id == session['user_id'])):
        db.session.delete(insp.id)
        commit_with_retry()  # Использование повторных попыток для удаления
        return jsonify({'success': True})
    return jsonify({'error': 'Нет доступа'}), 403

@app.route('/api/inspections/stats', methods=['GET'])
def daily_stats():
    if session.get('role') != 'foreman':
        return jsonify({'error': 'Нет доступа'}), 403
    date_str = request.args.get('date')
    recs = Inspection.query.filter_by(
        foreman_id=session['user_id'],
        date=date.fromisoformat(date_str)
    ).all()
    houses = len(recs)
    totalA = sum(r.total_apartments for r in recs)
    done = sum(r.total_done for r in recs)
    return jsonify({
        'housesCount': houses,
        'totalApartmentsCount': totalA,
        'doneApartmentsCount': done
    })

# --------------------------------
# Сидирование начальника и 5 бригадиров
# --------------------------------
def seed_users():
    if User.query.count() == 0:
        admin = User(
            login='boss@example.com',
            password=generate_password_hash('admin123'),
            role='boss'
        )
        db.session.add(admin)
        for i in range(1, 6):
            foreman = User(
                login=f'foreman{i}@example.com',
                password=generate_password_hash(f'brigade{i}pass'),
                role='foreman'
            )
            db.session.add(foreman)
        commit_with_retry()  # Использование повторных попыток для сидирования данных

# --------------------------------
# Запуск приложения
# --------------------------------
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_users()
        print('DB path:', db_path, '| exists:', os.path.exists(db_path))
    app.run(debug=True)
