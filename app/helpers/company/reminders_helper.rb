module Company::RemindersHelper
  def find_reminderable_last_reminder(reminderable)
    current_user.try(:reminders).where(reminderable_type: reminderable.try(:class) ,reminderable_id: reminderable.id).try(:last)
  end
end
