class Reminder < ActiveRecord::Base

  enum status: [:done, :not_done]

  validates :title            ,presence: :true
  validates :remind_at        ,presence: :true
  validates :remind_at, date: { after_or_equal_to: Time.now, message: ' can not be  in Past .'}

  belongs_to     :user
  belongs_to     :reminderable ,polymorphic:  :true

  after_create   :add_reminder_in_delayed_job


  def add_reminder_in_delayed_job
    self.delay(run_at: self.remind_at).send_reminder_email
  end

  def send_reminder_email
    self.user.notifications.create(message: "<p>You have Reminder about #{self.reminderable.class},  #{ self.reminderable_type == 'Company' ? self.reminderable.try(:name) : self.reminderable.try(:full_name)}</p> <br> <p> Title for reminder: #{self.title}   ",title: "Reminder");
  end

end