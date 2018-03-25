class ConversationMessage < ApplicationRecord

  belongs_to :conversation
  belongs_to :userable, polymorphic: :true

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

end