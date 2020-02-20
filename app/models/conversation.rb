# frozen_string_literal: true

class Conversation < ApplicationRecord
  has_many :conversation_messages

  belongs_to :senderable, polymorphic: :true, optional: true
  belongs_to :recipientable, polymorphic: :true, optional: true
  belongs_to :chatable, polymorphic: true, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  belongs_to :sell_contract, optional: true
  belongs_to :buy_contract, optional: true

  enum topic: %i[OneToOne Rate GroupChat Job JobApplication Contract SellContract BuyContract DocumentRequest]

  scope :involving, lambda { |user|
    where(senderable: user).or where(recipientable: user)
  }

  scope :between, lambda { |sender, recipient|
    where(senderable: sender, recipientable: recipient).or where(senderable: recipient, recipientable: sender).order('updated_at desc')
  }

  scope :all_onversations, lambda { |user|
    where(chatable: Group.where(member_type: 'Chat').joins(:groupables).candidate_or_user_admin_groupable(user)).order('updated_at desc').uniq
  }

  scope :conversation_of, lambda { |_company, query_string, user|
    where(chatable: Group.candidate_or_user_admin_groupable(user).joins(:groupables).where("group_name LIKE '%#{query_string}%' OR (groupables.groupable_type = 'User' and groupables.groupable_id IN  (?))", User.where('first_name LIKE ? OR last_name LIKE ?', "%#{query_string}%", "%#{query_string}%").ids)).order('updated_at desc')
  }

  def self.create_conversation(users, title, topic, company)
    group = nil
    Group.transaction do
      group = company.groups.create(group_name: title, member_type: 'Chat')
      users.each { |user| group.groupables.create(groupable: user) }
    end
    conversation = Conversation.new(chatable: group, topic: topic)
    group && conversation.save ? conversation : false
  end

  def opt_participant(user)
    chatable.present? ? chatable : (senderable == user ? recipientable : senderable)
  end
end
