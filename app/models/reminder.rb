# frozen_string_literal: true

class Reminder < ApplicationRecord
  enum status: %i[done not_done]

  validates :title, presence: :true
  # validates :remind_at        ,presence: :true
  # validates :remind_at, date: { after_or_equal_to: Time.now, message: ' can not be  in Past .'}

  belongs_to     :user, optional: true
  belongs_to     :reminderable, polymorphic: :true

  after_create   :add_reminder_in_delayed_job

  def add_reminder_in_delayed_job
    delay(run_at: remind_at).send_reminder_email
  end

  def send_reminder_email
    user.notifications.create(message: "<p>You have Reminder about #{reminderable.class},  #{reminderable_type == 'Company' ? reminderable.try(:name) : reminderable.try(:full_name)}</p> <br> <p> Title for reminder: #{title}   ", title: 'Reminder')
  end
end
