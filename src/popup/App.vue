<script setup lang="ts">
// Keeper - Password Manager
// TODO: Implement lock screen, vault list, keyboard navigation
</script>

<template>
  <div class="keeper-popup">
    <header>
      <h1>Keeper</h1>
    </header>
    <main>
      <p>密码管理器</p>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 400px;
  min-height: 500px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.keeper-popup {
  padding: 16px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

h1 {
  font-size: 18px;
  font-weight: 600;
}
</style>
