class Groupable < ActiveRecord::Base
  belongs_to :groupable, polymorphic: true
  belongs_to :group ,dependent:  :destroy
end
