class CustomField < ActiveRecord::Base

  belongs_to :customizable, polymorphic: true

end
