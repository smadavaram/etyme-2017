class Conversation < ApplicationRecord

  has_many :conversation_messages

  belongs_to :senderable, polymorphic: :true, optional: true
  belongs_to :recipientable, polymorphic: :true, optional: true
  belongs_to :chatable, polymorphic: true, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  enum topic: [:OneToOne, :Rate, :GroupChat, :Job, :JobApplication]

  scope :involving, -> (user) do
    where(senderable: user).or where(recipientable: user)
  end

  scope :between, -> (sender, recipient) do
    where(senderable: sender, recipientable: recipient).or where(senderable: recipient, recipientable: sender)
  end


  def opt_participant(user)
    chatable.present?  ? chatable : (senderable == user ? recipientable : senderable)
  end

end
