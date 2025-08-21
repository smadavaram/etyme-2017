class AddFileToAttachableDoc < ActiveRecord::Migration[4.2]
  def change
    add_column :attachable_docs, :file, :string
  end
end
