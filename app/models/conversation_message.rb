# frozen_string_literal: true

class ConversationMessage < ApplicationRecord
  belongs_to :conversation
  belongs_to :userable, polymorphic: :true
  enum message_type: %i[job_conversation rate_confirmation schedule_interview DocumentRequest]
  # after_create :create_notification
  after_create :set_conversation_updated_at
  scope :unread_messages, -> (sender, recipient) do
    joins(:conversation).where("(
                                  ( senderable_type = ? AND senderable_id = ? )
                                    OR
                                  ( recipientable_type = ? AND recipientable_id = ? )
                                )
                                  AND
                                (
                                  ( senderable_type = ? AND senderable_id = ? )
                                    OR
                                  ( recipientable_type = ? AND recipientable_id = ? )
                                )",
                               recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id,
                               sender.class.to_s, sender.id, sender.class.to_s, sender.id).where.not(is_read: true, userable: recipient)
  end

  def create_notification
    senderable_name = "#{userable.first_name} #{userable.last_name}"
    notification_message = "#{senderable_name}: #{body}"
    if conversation.chatable_id? && conversation.chatable_type != 'JobApplication'
      groupables = conversation.chatable&.groupables
      if groupables.present?
        groupables.each do |group|
          group.groupable.notifications.create(notification_type: :chat, createable: userable, message: notification_message, title: 'Job Application Conversation') if userable_id != group.groupable.id
        end
      end
    else
      conversation.recipientable.notifications.create(notification_type: :chat, createable: userable, message: notification_message, title: 'Job Application Conversation')
    end
  end

  def set_conversation_updated_at
    conversation.update(updated_at: DateTime.now)
  end
end
