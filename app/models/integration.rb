class Integration < ApplicationRecord
  belongs_to :company
  has_many :plugin, polymorphic: true
end