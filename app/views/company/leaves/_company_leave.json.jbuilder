json.extract! consultant_leave, :id, :from_date, :till_date, :reason, :response_message, :status, :leave_type, :created_at, :updated_at
json.url consultant_leave_path(consultant_leave, format: :json)