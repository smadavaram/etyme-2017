class CompanyContact < ApplicationRecord
  belongs_to :company, optional: true
  validates_uniqueness_of :email,  scope: :company_id
  has_many :notifications       , as: :notifiable,dependent: :destroy


  scope :search_by ,->(term) { CompanyContact.where('lower(first_name) like :term or lower(last_name) like :term or title like :term ' ,{term: "%#{term.downcase}%" })}

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end
  def full_name
    self.first_name + " " + self.last_name
  end
  def photo
    super.present? ? super : 'avatars/m_sunny_big.png'
  end

end
