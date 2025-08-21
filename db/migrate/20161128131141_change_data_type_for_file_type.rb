class ChangeDataTypeForFileType < ActiveRecord::Migration[4.2]
  def self.up
    change_table :attachments do |t|
      t.change :file_type, :string
    end
  end
  def self.down
    change_table :attachments do |t|
      t.change :file_type, :integer
    end
  end
end
