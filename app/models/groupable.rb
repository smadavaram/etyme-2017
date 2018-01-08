class Groupable < ApplicationRecord
  belongs_to :groupable, polymorphic: true
  belongs_to :group ,dependent:  :destroy, optional: true
end
