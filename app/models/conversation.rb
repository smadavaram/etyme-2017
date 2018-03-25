class Conversation < ApplicationRecord

  has_many   :conversation_messages

  belongs_to :senderable, polymorphic: :true
  belongs_to :recipientable, polymorphic: :true

  scope :involving, -> (user) do
    where(senderable: user).or where(senderable: user)
  end

  scope :between, -> (sender, recipient) do
    where(senderable: sender, recipientable: recipient).or where(senderable: recipient, recipientable: sender)
  end


  def opt_participant(user)
    senderable == user ? recipientable : senderable
  end

end
