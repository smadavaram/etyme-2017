class CreateReferences < ActiveRecord::Migration[5.1]
  def self.up
    create_table :references do |t|
      t.belongs_to :client
      t.string :reference_name
      t.string :reference_email
      
      t.timestamps
    end
  end

  def self.down
    drop_table :references
  end
end
