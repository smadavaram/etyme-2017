json.id @admin.id
json.domain @admin.company.domain
json.role @admin.roles.pluck(:name).join(', ')
json.name @admin.full_name
json.reminders @admin.reminders.pluck(:title).join(', ')
json.email @admin.email
json.phone @admin.phone