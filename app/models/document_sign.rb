class DocumentSign < ApplicationRecord
  belongs_to :documentable, polymorphic: :true, optional: true
  belongs_to :signable,     polymorphic: :true, optional: true
  belongs_to :company
end
