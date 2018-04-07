class Conversation < ApplicationRecord

  has_many   :conversation_messages

  belongs_to :senderable, polymorphic: :true, optional: true
  belongs_to :recipientable, polymorphic: :true, optional: true
  belongs_to :chatable, polymorphic: true, optional: true

  enum topic: [ :OneToOne, :Rate, :GroupChat, :Job ]

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
