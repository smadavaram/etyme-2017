class AddFileToAttachableDoc < ActiveRecord::Migration
  def change
    add_column :attachable_docs, :file, :string
  end
end
