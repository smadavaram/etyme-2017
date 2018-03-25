class CompanyContact < ActiveRecord::Base
  belongs_to :company
  validates_uniqueness_of :email,  scope: :company_id
  has_many :notifications       , as: :notifiable,dependent: :destroy


  scope :search_by ,->(term) { CompanyContact.where('lower(first_name) like :term or lower(last_name) like :term or title like :term ' ,{term: "%#{term.downcase}%" })}


  def full_name
    self.first_name + " " + self.last_name
  end
  def photo
    super.present? ? super : 'avatars/male.png'
  end

end
