class Role < ActiveRecord::Base

  has_and_belongs_to_many :permissions
  has_and_belongs_to_many :users
  belongs_to :company

  validates :name,presence: true

end
