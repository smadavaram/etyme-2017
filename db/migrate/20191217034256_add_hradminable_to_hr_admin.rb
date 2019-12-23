class AddHradminableToHrAdmin < ActiveRecord::Migration[5.1]
  #def change
  #end
  def up
    change_table :contract_admins do |t|
      t.references :admin_able, polymorphic: true
    end
  end

  def down
    change_table :contract_admins do |t|
      t.remove_references :admin_able, polymorphic: true
    end
  end
end
