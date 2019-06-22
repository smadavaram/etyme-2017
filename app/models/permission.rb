class Permission < ApplicationRecord

  has_and_belongs_to_many :roles

  validates_uniqueness_of :name
  validates :name,presence: true

end
