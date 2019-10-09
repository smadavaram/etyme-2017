class Conversation < ApplicationRecord

  has_many :conversation_messages

  belongs_to :senderable, polymorphic: :true, optional: true
  belongs_to :recipientable, polymorphic: :true, optional: true
  belongs_to :chatable, polymorphic: true, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  belongs_to :sell_contract, optional: true
  belongs_to :buy_contract, optional: true

  enum topic: [:OneToOne, :Rate, :GroupChat, :Job, :JobApplication, :Contract, :SellContract, :BuyContract, :DocumentRequest]

  scope :involving, -> (user) do
    where(senderable: user).or where(recipientable: user)
  end

  scope :between, -> (sender, recipient) do
    where(senderable: sender, recipientable: recipient).or where(senderable: recipient, recipientable: sender)
  end

  scope :all_onversations, -> (user) do
    where(chatable: Group.where(member_type: "Chat").joins(:groupables).candidate_or_user_admin_groupable(user)).uniq

  end

  scope :conversation_of, -> (company, query_string) do
    where(chatable_type: "Group", chatable_id: Group.joins(:groupables)
                                                   .where("groupables.groupable_type": "User", "groupables.groupable_id":
                                                       User.where("first_name LIKE ? OR last_name LIKE ?", "%#{query_string}%", "%#{query_string}%"))
                                                   .or(Group.joins(:groupables).where("groupables.groupable_type": "Candidate", "groupables.groupable_id":
                                                       Candidate.where("first_name LIKE ? OR last_name LIKE ?", "%#{query_string}%", "%#{query_string}%")))
    )
  end

  def self.create_conversation(users, title, topic, company)
    group = nil
    Group.transaction do
      group = company.groups.create(group_name: title, member_type: 'Chat')
      users.each { |user| group.groupables.create(groupable: user) }
    end
    conversation = Conversation.new({chatable: group, topic: topic})
    group and conversation.save ? conversation : false
  end

  def opt_participant(user)
    chatable.present? ? chatable : (senderable == user ? recipientable : senderable)
  end   
end
