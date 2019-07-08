class Conversation < ApplicationRecord

  has_many :conversation_messages

  belongs_to :senderable, polymorphic: :true, optional: true
  belongs_to :recipientable, polymorphic: :true, optional: true
  belongs_to :chatable, polymorphic: true, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  enum topic: [:OneToOne, :Rate, :GroupChat, :Job, :JobApplication, :Contract]

  scope :involving, -> (user) do
    where(senderable: user).or where(recipientable: user)
  end

  scope :between, -> (sender, recipient) do
    where(senderable: sender, recipientable: recipient).or where(senderable: recipient, recipientable: sender)
  end

  scope :all_onversations, -> (user) do
    where(chatable: Group.where(member_type: "Chat")
                        .joins(:groupables)
                        .where("groupables.groupable_id = ? and groupables.groupable_type = ?", user.id, "User").uniq)
  end

  scope :conversation_of, -> (company, query_string) do
    where(chatable_type: "Group", chatable_id: Group.joins(:groupables)
                                                   .where("groupables.groupable_type": "User", "groupables.groupable_id":
                                                       User.where("first_name LIKE ? OR last_name LIKE ?", "%#{query_string}%", "%#{query_string}%"))
                                                   .or(Group.joins(:groupables).where("groupables.groupable_type": "Candidate", "groupables.groupable_id":
                                                       Candidate.where("first_name LIKE ? OR last_name LIKE ?", "%#{query_string}%", "%#{query_string}%")))
    )
  end

  def opt_participant(user)
    chatable.present? ? chatable : (senderable == user ? recipientable : senderable)
  end

end
