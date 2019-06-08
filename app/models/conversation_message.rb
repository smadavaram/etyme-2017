class ConversationMessage < ApplicationRecord

  belongs_to :conversation
  belongs_to :userable, polymorphic: :true
  enum message_type: [:job_conversation,:rate_confirmation,:schedule_interview]
  # after_create :create_notification

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
                                sender.class.to_s, sender.id, sender.class.to_s, sender.id
                              ).where.not(is_read: true, userable: recipient)

  end

  def create_notification
    senderable_name = "#{self.userable.first_name} #{self.userable.last_name}"
    notification_message = "#{senderable_name}: #{self.body}"
    if self.conversation.chatable_id? && self.conversation.chatable_type != "JobApplication"
      groupables = self.conversation.chatable&.groupables
      if groupables.present?
        groupables.each do |group|
          if self.userable_id != group.groupable.id
            group.groupable.notifications.create(notification_type: :chat,createable: self.userable,message: notification_message, title: "Job Application Conversation")
          end
        end
      end
    else
      self.conversation.recipientable.notifications.create(notification_type: :chat,createable: self.userable,message: notification_message, title: "Job Application Conversation")
    end
  end
end