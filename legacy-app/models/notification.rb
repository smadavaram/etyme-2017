# frozen_string_literal: true

# == Schema Information
#
# Table name: notifications
#
#  id                :integer          not null, primary key
#  notifiable_id     :integer
#  notifiable_type   :string
#  message           :text
#  status            :integer          default("unread")
#  title             :string
#  notification_type :integer          default("chat")
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  createable_type   :string
#  createable_id     :bigint
#
class Notification < ApplicationRecord
  belongs_to :notifiable, polymorphic: true
  belongs_to :createable, polymorphic: true
  enum status: %i[unread read]
  enum notification_type: %i[chat application invitation application_status contract document_request job]
  after_create :send_notification_email
  default_scope { order(created_at: :desc) }
  scope :all_notifications, -> { where(notification_type: notification_types.keys) }

  private

  # After Create
  def send_notification_email
    NotificationMailer.notification_email(self).deliver
  end
end
