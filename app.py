import os
import sys

# Ensure UTF-8 output encoding on Windows consoles
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import shutil
import csv
import io
import re
import threading
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, Response, send_file
from tinydb import TinyDB, Query
from db_loader import init_database, DB_PATH, BASE_DIR, ADMIN_EMAIL, ADMIN_PASS

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.secret_key = 'dandiya-garba-night-2k26-rcc-studios-secret-key'

# Ensure database exists
if not os.path.exists(DB_PATH):
    init_database()

def get_db():
    return TinyDB(DB_PATH)

def get_user_record(db, username):
    users_table = db.table('users')
    User = Query()
    return users_table.get(User.username == username)

def get_admin_credentials(db):
    rec = get_user_record(db, ADMIN_EMAIL)
    if rec and rec.get('password'):
        return rec['username'], rec['password']
    return ADMIN_EMAIL, ADMIN_PASS

scan_lock = threading.Lock()
volunteer_last_scans = {}
COOLDOWN_SECONDS = 3.0

def resolve_student_record(students_table, raw_input, preferred_college=None):
    """
    Intelligently resolves a Dandiya pass record matching the scanned barcode or manual input.
    Supports:
    1. Direct barcode match (e.g. '26413', '11129', 'TC25210', '26002', '11304', '9420387011')
    2. Stripped whitespace/symbol match
    3. Roll number match
    4. Numeric phone number match (Box office attendees)
    Prioritizes PENDING records if duplicate IDs exist, respecting preferred_college if provided.
    """
    raw_str = (raw_input or '').strip()
    if not raw_str:
        return None, ''

    raw_upper = raw_str.upper()
    clean_upper = re.sub(r'[\s\-_#]+', '', raw_upper)
    all_records = students_table.all()

    def rank_matches(matches):
        if preferred_college:
            pref_up = preferred_college.strip().upper()
            return sorted(matches, key=lambda s: (
                0 if s.get('status') != 'ENTERED' and (s.get('college') or '').upper() == pref_up else
                1 if s.get('status') != 'ENTERED' else
                2 if (s.get('college') or '').upper() == pref_up else 3
            ))
        pending = [m for m in matches if m.get('status') != 'ENTERED']
        return pending if pending else matches

    # 1. Exact match on barcode
    direct_matches = [
        s for s in all_records
        if (s.get('barcode') or '').strip().upper() in (raw_upper, clean_upper)
    ]
    if direct_matches:
        ranked = rank_matches(direct_matches)
        return ranked[0], ranked[0].get('barcode', raw_upper)

    # 2. Exact match on roll_no
    roll_matches = [
        s for s in all_records
        if (s.get('roll_no') or '').strip().upper() in (raw_upper, clean_upper)
    ]
    if roll_matches:
        ranked = rank_matches(roll_matches)
        return ranked[0], ranked[0].get('barcode', raw_upper)

    # 3. Clean symbol stripped match
    stripped_matches = [
        s for s in all_records
        if re.sub(r'[\s\-_#]+', '', (s.get('barcode') or '').upper()) == clean_upper
    ]
    if stripped_matches:
        ranked = rank_matches(stripped_matches)
        return ranked[0], ranked[0].get('barcode', raw_upper)

    return None, raw_upper


@app.route('/')
@app.route('/api')
@app.route('/api/')
@app.route('/api/index.py')
def index():
    if request.args.get('debug'):
        return jsonify({
            'PATH_INFO': request.environ.get('PATH_INFO'),
            'QUERY_STRING': request.environ.get('QUERY_STRING'),
            'headers': {k: v for k, v in request.environ.items() if k.startswith('HTTP_') or 'PATH' in k or 'URI' in k}
        })
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password are required'}), 400

    db = get_db()
    admin_user, admin_pass = get_admin_credentials(db)

    # Check Admin Login
    if username == admin_user.lower() or username == 'rccindia@webworksstudios.com':
        if password == admin_pass:
            db.close()
            return jsonify({
                'success': True,
                'role': 'admin',
                'username': ADMIN_EMAIL,
                'name': 'Chief Event Administrator',
                'token': 'rcc-admin-session-token'
            })
        else:
            db.close()
            return jsonify({'success': False, 'message': 'Invalid administrator password'}), 401

    # Check Volunteer Login
    users_table = db.table('users')
    matched_user = None
    for u in users_table.all():
        u_user = u.get('username', '').strip().lower()
        if username == u_user and u.get('password') == password:
            matched_user = u
            break

    # Allow custom volunteer stations with the standard volunteer passcode
    if not matched_user and password == 'dandiya2026':
        matched_user = {
            'username': username,
            'name': username.replace('_', ' ').replace('-', ' ').title(),
            'role': 'volunteer'
        }

    db.close()

    if matched_user:
        return jsonify({
            'success': True,
            'role': matched_user.get('role', 'volunteer'),
            'username': matched_user.get('username'),
            'name': matched_user.get('name', matched_user.get('username').title()),
            'token': f"vol-{matched_user.get('username')}-token"
        })

    return jsonify({'success': False, 'message': 'Invalid credentials. Please verify username and password.'}), 401

@app.route('/api/scan', methods=['POST'])
def scan_barcode():
    data = request.json or {}
    raw_barcode = data.get('barcode', '').strip()
    volunteer = data.get('volunteer', 'Volunteer Gate').strip() or 'Volunteer Gate'

    if not raw_barcode:
        return jsonify({'success': False, 'message': 'Barcode cannot be empty'}), 400

    now_ts = time.time()
    client_key = f"{request.remote_addr}_{volunteer.lower()}"

    with scan_lock:
        # Enforce 3-second cooldown per gate
        last_vol_time = volunteer_last_scans.get(client_key, 0)
        time_since_last = now_ts - last_vol_time
        if time_since_last < COOLDOWN_SECONDS:
            remaining = round(COOLDOWN_SECONDS - time_since_last, 1)
            return jsonify({
                'success': False,
                'status': 'COOLDOWN_ACTIVE',
                'cooldown_remaining': remaining,
                'message': f'Anti-duplicate delay active. Please wait {remaining}s before next scan.'
            }), 429

        db = get_db()
        students_table = db.table('students')
        logs_table = db.table('logs')

        preferred_college = data.get('college')
        if not preferred_college and 'box' in volunteer.lower():
            preferred_college = 'BOX OFFICE'

        student, matched_barcode = resolve_student_record(students_table, raw_barcode, preferred_college)
        barcode_key = matched_barcode or raw_barcode.upper()

        now = datetime.now()
        ts_iso = now.isoformat()
        formatted_date = now.strftime('%d %b %Y')
        formatted_time = now.strftime('%I:%M:%S %p')

        # 1. NOT FOUND
        if not student:
            volunteer_last_scans[client_key] = now_ts
            logs_table.insert({
                'barcode': barcode_key,
                'student_name': 'UNREGISTERED',
                'college': 'N/A',
                'division': 'N/A',
                'roll_no': 'N/A',
                'status': 'NOT_FOUND',
                'timestamp': ts_iso,
                'date': formatted_date,
                'time': formatted_time,
                'volunteer': volunteer,
                'message': f'Barcode [{barcode_key}] not found in Dandiya database'
            })
            db.close()
            return jsonify({
                'success': False,
                'status': 'NOT_FOUND',
                'barcode': barcode_key,
                'cooldown_seconds': 3,
                'message': f'Pass [{barcode_key}] is NOT registered for Dandiya 2026!'
            })

        volunteer_last_scans[client_key] = now_ts

        # 2. SECOND ENTRY DENIED
        if student.get('status') == 'ENTERED':
            prev_date = student.get('entry_date', '')
            prev_time = student.get('entry_time', '')
            prev_vol = student.get('volunteer', 'Previous Gate')

            logs_table.insert({
                'barcode': barcode_key,
                'student_name': student.get('name'),
                'college': student.get('college'),
                'division': student.get('division'),
                'roll_no': student.get('roll_no'),
                'status': 'DUPLICATE_DENIED',
                'timestamp': ts_iso,
                'date': formatted_date,
                'time': formatted_time,
                'volunteer': volunteer,
                'message': f'Second entry denied. Already admitted at {prev_time} on {prev_date} by {prev_vol}'
            })
            db.close()
            return jsonify({
                'success': False,
                'status': 'DUPLICATE_DENIED',
                'message': 'SECOND ENTRY DENIED! This pass has already been used.',
                'student': student,
                'cooldown_seconds': 3,
                'first_entry': {
                    'date': prev_date,
                    'time': prev_time,
                    'volunteer': prev_vol
                }
            })

        # 3. ACCESS GRANTED
        students_table.update({
            'status': 'ENTERED',
            'entry_timestamp': ts_iso,
            'entry_date': formatted_date,
            'entry_time': formatted_time,
            'volunteer': volunteer
        }, doc_ids=[student.doc_id])

        student['status'] = 'ENTERED'
        student['entry_timestamp'] = ts_iso
        student['entry_date'] = formatted_date
        student['entry_time'] = formatted_time
        student['volunteer'] = volunteer

        logs_table.insert({
            'barcode': barcode_key,
            'student_name': student.get('name'),
            'college': student.get('college'),
            'division': student.get('division'),
            'roll_no': student.get('roll_no'),
            'status': 'GRANTED',
            'timestamp': ts_iso,
            'date': formatted_date,
            'time': formatted_time,
            'volunteer': volunteer,
            'message': 'Access Granted'
        })

        db.close()
        return jsonify({
            'success': True,
            'status': 'GRANTED',
            'message': f"ACCESS GRANTED! Welcome to Dandiya & Garba Night 2026",
            'cooldown_seconds': 3,
            'student': student
        })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    db = get_db()
    students_table = db.table('students')
    logs_table = db.table('logs')

    all_students = students_table.all()
    total = len(all_students)
    entered = sum(1 for s in all_students if s.get('status') == 'ENTERED')
    pending = total - entered
    overall_pct = round((entered / total * 100), 1) if total > 0 else 0

    colleges = {'DYPIMED': {}, 'DYPCOEI': {}, 'DYPTC': {}, 'DYPSOA': {}, 'BOX OFFICE': {}}
    for c in colleges.keys():
        c_students = [s for s in all_students if s.get('college') == c]
        c_total = len(c_students)
        c_entered = sum(1 for s in c_students if s.get('status') == 'ENTERED')
        colleges[c] = {
            'total': c_total,
            'entered': c_entered,
            'pending': c_total - c_entered,
            'percentage': round((c_entered / c_total * 100), 1) if c_total > 0 else 0
        }

    all_logs = logs_table.all()
    recent_logs = sorted(all_logs, key=lambda x: x.get('timestamp', ''), reverse=True)[:35]

    db.close()
    return jsonify({
        'total': total,
        'entered': entered,
        'pending': pending,
        'percentage': overall_pct,
        'colleges': colleges,
        'recent_logs': recent_logs
    })

@app.route('/api/students', methods=['GET'])
def get_students():
    college_filter = request.args.get('college', 'ALL').strip()
    status_filter = request.args.get('status', 'ALL').strip()
    search = request.args.get('search', '').strip().lower()

    db = get_db()
    students_table = db.table('students')
    all_students = students_table.all()
    db.close()

    results = []
    for s in all_students:
        if college_filter != 'ALL' and s.get('college') != college_filter:
            continue
        if status_filter != 'ALL' and s.get('status') != status_filter:
            continue
        if search:
            name_match = search in (s.get('name') or '').lower()
            barcode_match = search in (s.get('barcode') or '').lower()
            roll_match = search in (s.get('roll_no') or '').lower()
            div_match = search in (s.get('division') or '').lower()
            if not (name_match or barcode_match or roll_match or div_match):
                continue
        results.append(s)

    # Sort: Entered first, then alphabetical by name
    results.sort(key=lambda x: (0 if x.get('status') == 'ENTERED' else 1, x.get('name', '')))

    return jsonify({
        'total': len(results),
        'students': results[:150]  # Return top 150 matching records for responsive rendering
    })

@app.route('/api/checkin', methods=['POST'])
def manual_checkin():
    data = request.json or {}
    barcode = data.get('barcode', '').strip()
    volunteer = data.get('volunteer', 'Admin Override').strip()

    if not barcode:
        return jsonify({'success': False, 'message': 'Barcode required'}), 400

    db = get_db()
    students_table = db.table('students')
    logs_table = db.table('logs')

    student, matched_barcode = resolve_student_record(students_table, barcode)
    if not student:
        db.close()
        return jsonify({'success': False, 'message': 'Attendee not found'}), 404

    now = datetime.now()
    ts_iso = now.isoformat()
    formatted_date = now.strftime('%d %b %Y')
    formatted_time = now.strftime('%I:%M:%S %p')

    students_table.update({
        'status': 'ENTERED',
        'entry_timestamp': ts_iso,
        'entry_date': formatted_date,
        'entry_time': formatted_time,
        'volunteer': f"{volunteer} (Manual)"
    }, doc_ids=[student.doc_id])

    student['status'] = 'ENTERED'
    student['entry_timestamp'] = ts_iso
    student['entry_date'] = formatted_date
    student['entry_time'] = formatted_time
    student['volunteer'] = f"{volunteer} (Manual)"

    logs_table.insert({
        'barcode': student.get('barcode'),
        'student_name': student.get('name'),
        'college': student.get('college'),
        'division': student.get('division'),
        'roll_no': student.get('roll_no'),
        'status': 'GRANTED',
        'timestamp': ts_iso,
        'date': formatted_date,
        'time': formatted_time,
        'volunteer': f"{volunteer} (Manual)",
        'message': 'Manual Check-in Override'
    })

    db.close()
    return jsonify({
        'success': True,
        'message': f"Manual check-in completed for {student.get('name')}",
        'student': student
    })

@app.route('/api/undo', methods=['POST'])
def undo_checkin():
    data = request.json or {}
    barcode = data.get('barcode', '').strip()
    admin_name = data.get('admin', 'Admin').strip()

    if not barcode:
        return jsonify({'success': False, 'message': 'Barcode required'}), 400

    db = get_db()
    students_table = db.table('students')
    logs_table = db.table('logs')

    student, matched_barcode = resolve_student_record(students_table, barcode)
    if not student:
        db.close()
        return jsonify({'success': False, 'message': 'Attendee not found'}), 404

    students_table.update({
        'status': 'PENDING',
        'entry_timestamp': None,
        'entry_date': None,
        'entry_time': None,
        'volunteer': None
    }, doc_ids=[student.doc_id])

    now = datetime.now()
    logs_table.insert({
        'barcode': student.get('barcode'),
        'student_name': student.get('name'),
        'college': student.get('college'),
        'division': student.get('division'),
        'roll_no': student.get('roll_no'),
        'status': 'RESET',
        'timestamp': now.isoformat(),
        'date': now.strftime('%d %b %Y'),
        'time': now.strftime('%I:%M:%S %p'),
        'volunteer': admin_name,
        'message': f"Check-in undone by {admin_name}"
    })

    db.close()
    return jsonify({
        'success': True,
        'message': f"Pass for {student.get('name')} reverted back to PENDING."
    })

@app.route('/api/reset', methods=['POST'])
def reset_attendance():
    data = request.json or {}
    password = data.get('password', '').strip()

    db = get_db()
    admin_user, admin_pass = get_admin_credentials(db)

    if password != admin_pass:
        db.close()
        return jsonify({'success': False, 'message': 'Incorrect administrator password'}), 403

    # Create safety backup in backups directory
    backups_dir = os.path.join(BASE_DIR, 'backups')
    os.makedirs(backups_dir, exist_ok=True)
    backup_file = os.path.join(backups_dir, f"pre_reset_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    shutil.copy2(DB_PATH, backup_file)

    students_table = db.table('students')
    logs_table = db.table('logs')

    all_students = students_table.all()
    doc_ids = [s.doc_id for s in all_students]

    students_table.update({
        'status': 'PENDING',
        'entry_timestamp': None,
        'entry_date': None,
        'entry_time': None,
        'volunteer': None
    }, doc_ids=doc_ids)

    now = datetime.now()
    logs_table.insert({
        'barcode': 'SYSTEM',
        'student_name': 'ALL ATTENDEES',
        'college': 'ALL',
        'division': 'ALL',
        'roll_no': 'ALL',
        'status': 'SYSTEM_RESET',
        'timestamp': now.isoformat(),
        'date': now.strftime('%d %b %Y'),
        'time': now.strftime('%I:%M:%S %p'),
        'volunteer': 'Admin',
        'message': f"All {len(doc_ids)} attendees reset to PENDING. Backup created: {os.path.basename(backup_file)}"
    })

    db.close()
    return jsonify({
        'success': True,
        'message': f"All {len(doc_ids)} attendees successfully reset to PENDING.",
        'backup': os.path.basename(backup_file)
    })

@app.route('/api/export', methods=['GET'])
def export_csv():
    db = get_db()
    students_table = db.table('students')
    all_students = students_table.all()
    db.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Sr. No', 'College', 'Student Name', 'Division / Course', 'Barcode / ID', 'Status', 'Entry Date', 'Entry Time', 'Verified By'])

    for idx, s in enumerate(all_students, start=1):
        writer.writerow([
            idx,
            s.get('college', ''),
            s.get('name', ''),
            s.get('division', ''),
            s.get('barcode', ''),
            s.get('status', 'PENDING'),
            s.get('entry_date', '') or 'N/A',
            s.get('entry_time', '') or 'N/A',
            s.get('volunteer', '') or 'N/A'
        ])

    output.seek(0)
    filename = f"dandiya-2026-attendance-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )

@app.route('/api/change-password', methods=['POST'])
def change_password():
    data = request.json or {}
    current_pass = data.get('current_password', '').strip()
    new_pass = data.get('new_password', '').strip()

    if not current_pass or not new_pass:
        return jsonify({'success': False, 'message': 'Both current and new password are required'}), 400

    if len(new_pass) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters'}), 400

    db = get_db()
    admin_user, admin_pass = get_admin_credentials(db)

    if current_pass != admin_pass:
        db.close()
        return jsonify({'success': False, 'message': 'Current password is incorrect'}), 401

    users_table = db.table('users')
    User = Query()
    admin_rec = users_table.get(User.username == admin_user)
    if admin_rec:
        users_table.update({'password': new_pass}, doc_ids=[admin_rec.doc_id])
    else:
        users_table.insert({
            'username': admin_user,
            'password': new_pass,
            'role': 'admin',
            'name': 'Chief Event Administrator'
        })

    db.close()
    return jsonify({'success': True, 'message': 'Administrator password updated successfully'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"==================================================")
    print(f"*** RAAS DANDIYA & GARBA NIGHT 2026 ACCESS SERVER ***")
    print(f"Admin Email: {ADMIN_EMAIL}")
    print(f"Server running at: http://127.0.0.1:{port}")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=True)
