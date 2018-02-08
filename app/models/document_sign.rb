class DocumentSign < ApplicationRecord
  belongs_to :documentable, polymorphic: :true
  belongs_to :signable,     polymorphic: :true
end
