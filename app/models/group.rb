class Group < ApplicationRecord

  belongs_to :company, optional: true
  has_many :groupables, dependent: :destroy
  has_many :candidates, through: :groupables, source: "groupable", source_type: "Candidate"
  has_many :companies, through: :groupables, source: "groupable", source_type: "Company"
  has_many :users, through: :groupables, source: "groupable", source_type: "User"
  has_many :company_contacts, through: :groupables, source: "groupable", source_type: "CompanyContact"
  has_many :black_listers, as: :blacklister
  has_many :statuses, as: :statusable, dependent: :destroy
  has_many :reminders, as: :reminderable

  scope :user_emails, ->(group_id) {Group.find(group_id).users.select(:email)}
  scope :candidate_emails, ->(group_id) {Group.find(group_id).candidates.select(:email)}

  scope :chat_groups, -> { where(member_type: 'Chat') }
  scope :contact_groups, -> { where("member_type IN('Candidate', 'Contact')" ) }

  scope :user_chat_groups, -> (user, company) do
    company.present? ?
        where(member_type: "Chat", company_id: company.id).joins(:groupables).where("groupables.groupable_id = ? and groupables.groupable_type = ?", user.id, "User")
        :
        where(member_type: "Chat").joins(:groupables).where("groupables.groupable_id = ? and groupables.groupable_type = ?", user.id, "Candidate")
  end
  scope :candidate_or_user_admin_groupable, -> (user) do
    user.class.to_s == "Candidate" ?
        where("groupables.groupable_id = ? and groupables.groupable_type = ?", user.id, "Candidate")
        :
        where("groupables.groupable_id = ? and groupables.groupable_type IN (?)", user.id, ["User", "Admin"])
  end


  def get_blacklist_status(black_list_company_id)
    self.black_listers.find_by(company_id: black_list_company_id)&.status || 'unbanned'
  end

  def photo
    ActionController::Base.helpers.asset_path('default_logo.png')
  end

  def full_name
    group_name.to_s.titleize
  end
end
