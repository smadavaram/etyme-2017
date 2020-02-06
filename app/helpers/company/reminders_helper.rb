# frozen_string_literal: true

module Company::RemindersHelper
  def find_reminderable_last_reminder(reminderable)
    current_user.try(:reminders).where(reminderable_type: reminderable.try(:class).to_s, reminderable_id: reminderable.id).try(:last)
  end
end
