class CompanyContact < ActiveRecord::Base
  belongs_to :company
  validates_uniqueness_of :email,  scope: :company_id

  def full_name
    self.first_name + " " + self.last_name
  end
  def photo
    super.present? ? super : 'avatars/male.png'
  end

end
